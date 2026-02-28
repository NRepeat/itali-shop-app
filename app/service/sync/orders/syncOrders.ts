import { prisma } from "@shared/lib/prisma/prisma.server";
import { getOrders } from "@/service/italy/orders/getOrders";
import { client } from "../client/shopify";
import { toE164 } from "@/shared/phone";

const WORKERS = 1; // Dev store: max 5 orders/min regardless of API
const DELAY_BETWEEN_ORDERS_MS = 12_000; // ~5 orders/min to stay under limit

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

const ORDER_CREATE_MUTATION = `
  mutation orderCreate($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {
    orderCreate(order: $order, options: $options) {
      userErrors {
        field
        message
      }
      order {
        id
      }
    }
  }
`;

const GET_PRODUCT_VARIANTS_QUERY = `
  query getProductVariants($id: ID!) {
    product(id: $id) {
      variants(first: 100) {
        nodes {
          id
          selectedOptions {
            name
            value
          }
        }
      }
    }
  }
`;

const GET_VARIANT_BY_SKU_QUERY = `
  query getVariantBySku($query: String!) {
    productVariants(first: 5, query: $query) {
      nodes {
        id
        sku
        product {
          id
        }
        selectedOptions {
          name
          value
        }
      }
    }
  }
`;

function mapFinancialStatus(orderStatusId: number): "PAID" | "PENDING" | "REFUNDED" | "VOIDED" {
  switch (orderStatusId) {
    case 1:
      return "PENDING";
    case 8:
    case 11:
    case 13:
      return "REFUNDED";
    case 9:
    case 16:
      return "VOIDED";
    default:
      return "PAID";
  }
}

function mapFulfillmentStatus(orderStatusId: number): "FULFILLED" | null {
  if (orderStatusId === 3 || orderStatusId === 5) return "FULFILLED";
  return null;
}

function mapOrderTags(orderStatusId: number, baseTag: string): string[] {
  const statusTags: Record<number, string> = {
    1:  "status-pending",
    2:  "status-confirmed",
    3:  "status-shipped",
    5:  "status-completed",
    7:  "status-refused",
    8:  "status-return",
    9:  "status-cancelled",
    10: "status-size-exchange",
    11: "status-refunded",
    12: "status-changed",
    13: "status-full-return",
    14: "status-out-of-stock",
    15: "status-processed",
    16: "status-annulled",
  };
  const tags = [baseTag];
  const statusTag = statusTags[orderStatusId];
  if (statusTag) tags.push(statusTag);
  return tags;
}

async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 7,
  delayMs = 60_000,
): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      const msg = error.message || "";
      const isThrottled =
        msg.includes("Throttled") ||
        msg.includes("throttled") ||
        msg.includes("rate limit") ||
        msg.includes("429") ||
        msg.includes("try again") ||
        error.extensions?.code === "THROTTLED";

      if (isThrottled && attempt < retries) {
        const wait = delayMs * Math.min(2 ** attempt, 4);
        console.log(
          `Rate limited, waiting ${Math.round(wait / 1000)}s (attempt ${attempt + 1}/${retries})`,
        );
        await sleep(wait);
        continue;
      }
      throw error;
    }
  }
  throw new Error("Max retries exceeded");
}

export const syncOrders = async (
  domain: string,
  accessToken: string,
  limit?: number,
) => {
  const logs: string[] = [];
  const log = (msg: string) => {
    console.log(msg);
    logs.push(msg);
  };

  try {
    const allOrders = await getOrders();
    log(`Found ${allOrders.length} orders in external DB`);

    const existingMaps = await prisma.orderMap.findMany({
      select: { localOrderId: true },
    });
    const syncedIds = new Set(existingMaps.map((m) => m.localOrderId));

    const newOrders = allOrders.filter((o) => !syncedIds.has(o.order_id));
    log(`${newOrders.length} orders not yet synced`);

    const ordersToSync = limit ? newOrders.slice(0, limit) : newOrders;
    const total = ordersToSync.length;
    log(
      `Syncing ${total} orders${limit ? ` (limited to ${limit})` : ""}`,
    );

    // Pre-load customer and product maps
    const customerMaps = await prisma.customerMap.findMany();
    const customerMapByLocal = new Map(
      customerMaps.map((m) => [m.localCustomerId, m.shopifyCustomerId]),
    );

    // Cache: SKU -> variant data from Shopify
    const skuCache = new Map<
      string,
      { variantId: string; productGid: string } | null
    >();

    // Cache: productGid -> all variants
    const variantCache = new Map<
      string,
      Array<{ id: string; selectedOptions: Array<{ name: string; value: string }> }>
    >();

    async function findVariantBySku(sku: string) {
      if (skuCache.has(sku)) {
        return skuCache.get(sku)!;
      }
      try {
        const result = await withRetry(() =>
          client.request<any, any>({
            query: GET_VARIANT_BY_SKU_QUERY,
            variables: { query: `sku:${sku}` },
            accessToken,
            shopDomain: domain,
          }),
        );
        const variant = result?.productVariants?.nodes?.[0];
        if (variant) {
          const data = {
            variantId: variant.id,
            productGid: variant.product.id,
          };
          skuCache.set(sku, data);
          return data;
        }
        skuCache.set(sku, null);
        return null;
      } catch {
        skuCache.set(sku, null);
        return null;
      }
    }

    async function getVariantsForProduct(shopifyProductGid: string) {
      if (variantCache.has(shopifyProductGid)) {
        return variantCache.get(shopifyProductGid)!;
      }
      try {
        const result = await withRetry(() =>
          client.request<any, any>({
            query: GET_PRODUCT_VARIANTS_QUERY,
            variables: { id: shopifyProductGid },
            accessToken,
            shopDomain: domain,
          }),
        );
        const variants = result?.product?.variants?.nodes || [];
        variantCache.set(shopifyProductGid, variants);
        return variants;
      } catch {
        variantCache.set(shopifyProductGid, []);
        return [];
      }
    }

    async function createOrderInShopify(
      order: (typeof ordersToSync)[number],
    ): Promise<string> {
      const shopifyCustomerGid = customerMapByLocal.get(order.customer_id);
      const currency = order.currency_code || "UAH";

      // Build line items — find variants in Shopify by SKU (model)
      const lineItems: Record<string, any>[] = [];
      for (const p of order.products) {
        const item: Record<string, any> = {
          title: p.name,
          quantity: p.quantity,
          priceSet: {
            shopMoney: {
              amount: Number(p.price),
              currencyCode: currency,
            },
          },
        };

        // Look up product in Shopify by model (SKU)
        const sku = p.model;
        if (sku) {
          const found = await findVariantBySku(sku);
          if (found) {
            const productOptions = order.options.filter(
              (o) => o.order_product_id === p.order_product_id,
            );

            if (productOptions.length === 0) {
              // No options — use the variant found by SKU directly
              item.variantId = found.variantId;
            } else {
              // Has options — fetch all variants for the product and match
              const variants = await getVariantsForProduct(found.productGid);
              const matchedVariant = variants.find((v) =>
                productOptions.every((orderOpt) =>
                  v.selectedOptions.some(
                    (so) =>
                      so.name === orderOpt.name && so.value === orderOpt.value,
                  ),
                ),
              );

              if (matchedVariant) {
                item.variantId = matchedVariant.id;
              } else {
                // Fallback to SKU variant if no option match
                item.variantId = found.variantId;
              }
            }
          }
        }

        lineItems.push(item);
      }

      if (lineItems.length === 0) {
        throw new Error("No line items");
      }

      const financialStatus = mapFinancialStatus(order.order_status_id);
      const fulfillmentStatus = mapFulfillmentStatus(order.order_status_id);
      const tags = mapOrderTags(order.order_status_id, "imported");

      // Build GraphQL OrderCreateOrderInput
      const orderInput: Record<string, any> = {
        currency,
        lineItems,
        financialStatus,
        tags,
        note: order.comment || undefined,
        shippingAddress: {
          firstName: order.shipping_firstname,
          lastName: order.shipping_lastname,
          company: order.shipping_company || undefined,
          address1: order.shipping_address_1,
          address2: order.shipping_address_2 || undefined,
          city: order.shipping_city,
          zip: order.shipping_postcode,
          countryCode: "UA",
          provinceCode: order.shipping_zone || undefined,
        },
        billingAddress: {
          firstName: order.payment_firstname,
          lastName: order.payment_lastname,
          company: order.payment_company || undefined,
          address1: order.payment_address_1,
          address2: order.payment_address_2 || undefined,
          city: order.payment_city,
          zip: order.payment_postcode,
          countryCode: "UA",
          provinceCode: order.payment_zone || undefined,
        },
      };

      if (fulfillmentStatus) {
        orderInput.fulfillmentStatus = fulfillmentStatus;
      }

      // Customer — use toAssociate for existing, toUpsert for new
      if (shopifyCustomerGid) {
        orderInput.customer = {
          toAssociate: { id: shopifyCustomerGid },
        };
      } else {
        const customerUpsert: Record<string, any> = {};
        if (order.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(order.email)) {
          customerUpsert.email = order.email;
        }
        const phone = toE164(order.telephone);
        if (phone) {
          customerUpsert.phone = phone;
        }
        if (Object.keys(customerUpsert).length > 0) {
          orderInput.customer = { toUpsert: customerUpsert };
        }
      }

      // Custom attributes (payment method + original order date)
      const customAttributes: Array<{ key: string; value: string }> = [
        { key: "original_order_date", value: order.date_added.toISOString() },
      ];
      if (order.payment_method) {
        customAttributes.push({ key: "payment_method", value: order.payment_method });
      }
      orderInput.customAttributes = customAttributes;

      // Shipping lines with priceSet
      const shippingTotal = order.totals.find((t) => t.code === "shipping");
      if (shippingTotal && Number(shippingTotal.value) > 0) {
        orderInput.shippingLines = [
          {
            title: shippingTotal.title || "Shipping",
            priceSet: {
              shopMoney: {
                amount: Number(shippingTotal.value),
                currencyCode: currency,
              },
            },
          },
        ];
      }

      // Transaction for paid orders
      if (financialStatus === "PAID") {
        let totalAmount = lineItems.reduce(
          (sum, li) => sum + Number(li.priceSet.shopMoney.amount) * li.quantity,
          0,
        );
        if (shippingTotal) {
          totalAmount += Number(shippingTotal.value);
        }

        orderInput.transactions = [
          {
            kind: "SALE",
            status: "SUCCESS",
            processedAt: order.date_added.toISOString(),
            amountSet: {
              shopMoney: {
                amount: totalAmount,
                currencyCode: currency,
              },
            },
          },
        ];
      }

      const result = await client.request<any, any>({
        query: ORDER_CREATE_MUTATION,
        variables: {
          order: orderInput,
          options: {
            inventoryBehaviour: "BYPASS",
            sendReceipt: false,
            sendFulfillmentReceipt: false,
          },
        },
        accessToken,
        shopDomain: domain,
      });

      const userErrors = result?.orderCreate?.userErrors;
      if (userErrors && userErrors.length > 0) {
        const isPhoneError = userErrors.some((e: any) =>
          JSON.stringify(e.field).includes("phone"),
        );
        if (isPhoneError) {
          console.error(`Phone error for order #${order.order_id}: raw="${order.telephone}" e164="${toE164(order.telephone)}"`);
        }
        throw new Error(
          userErrors.map((e: any) => `${e.field}: ${e.message}`).join(", "),
        );
      }

      const shopifyOrderGid = result?.orderCreate?.order?.id;
      if (!shopifyOrderGid) {
        throw new Error("No order ID returned");
      }

      await prisma.orderMap.upsert({
        where: { localOrderId: order.order_id },
        update: { shopifyOrderId: shopifyOrderGid },
        create: {
          localOrderId: order.order_id,
          shopifyOrderId: shopifyOrderGid,
        },
      });

      return shopifyOrderGid;
    }

    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;
    const startTime = Date.now();

    for (const [index, order] of ordersToSync.entries()) {
      try {
        log(
          `[${index + 1}/${total}] Creating order #${order.order_id} for ${order.firstname} ${order.lastname}`,
        );

        const shopifyOrderId = await withRetry(() =>
          createOrderInShopify(order),
        );

        successCount++;

        const elapsed = Date.now() - startTime;
        const processed = successCount + errorCount + skippedCount;
        const avgMs = elapsed / processed;
        const remaining = total - processed;
        const etaMin = Math.round((remaining * avgMs) / 60_000);

        log(
          `[${index + 1}/${total}] ✓ Created: ${shopifyOrderId} | Progress: ${processed}/${total} | ETA: ~${etaMin}min`,
        );
      } catch (e: any) {
        if (e.message === "No line items") {
          skippedCount++;
          log(`[${index + 1}/${total}] Skipped: no line items`);
        } else {
          errorCount++;
          log(`[${index + 1}/${total}] ✗ Error: ${e.message}`);
        }
      }

      // Delay between orders to avoid rate limit
      if (index < ordersToSync.length - 1) {
        await sleep(DELAY_BETWEEN_ORDERS_MS);
      }
    }

    const totalElapsed = Math.round((Date.now() - startTime) / 60_000);

    log(`\n=== Sync Summary ===`);
    log(`Total processed: ${total}`);
    log(`Success: ${successCount}`);
    log(`Errors: ${errorCount}`);
    log(`Skipped: ${skippedCount}`);
    log(`Time elapsed: ${totalElapsed} minutes`);
    log(`====================\n`);

    return { logs, successCount, errorCount, skippedCount };
  } catch (e: any) {
    logs.push(`Error: ${e.message}`);
    throw Object.assign(new Error(`Error syncing orders: ${e.message}`), {
      logs,
    });
  }
};