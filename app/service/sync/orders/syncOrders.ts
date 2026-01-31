import { prisma } from "@shared/lib/prisma/prisma.server";
import { getOrders } from "@/service/italy/orders/getOrders";
import { client } from "../client/shopify";

const API_VERSION = "2025-10";

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

function mapFulfillmentStatus(orderStatusId: number): string | null {
  if (orderStatusId === 3 || orderStatusId === 5) return "fulfilled";
  return null;
}

function extractShopifyNumericId(gid: string): string {
  const parts = gid.split("/");
  return parts[parts.length - 1];
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
    log(
      `Syncing ${ordersToSync.length} orders${limit ? ` (limited to ${limit})` : ""}`,
    );

    // Pre-load customer and product maps
    const customerMaps = await prisma.customerMap.findMany();
    const customerMapByLocal = new Map(
      customerMaps.map((m) => [m.localCustomerId, m.shopifyCustomerId]),
    );

    const productMaps = await prisma.productMap.findMany();
    const productMapByLocal = new Map(
      productMaps.map((m) => [m.localProductId, m.shopifyProductId]),
    );

    // Cache for Shopify product variants (productGid -> variants[])
    const variantCache = new Map<
      string,
      Array<{ id: string; selectedOptions: Array<{ name: string; value: string }> }>
    >();

    async function getVariantsForProduct(
      shopifyProductGid: string,
    ) {
      if (variantCache.has(shopifyProductGid)) {
        return variantCache.get(shopifyProductGid)!;
      }
      try {
        const result = await client.request<any, any>({
          query: GET_PRODUCT_VARIANTS_QUERY,
          variables: { id: shopifyProductGid },
          accessToken,
          shopDomain: domain,
        });
        const variants = result?.product?.variants?.nodes || [];
        variantCache.set(shopifyProductGid, variants);
        return variants;
      } catch {
        variantCache.set(shopifyProductGid, []);
        return [];
      }
    }

    for (const [i, order] of ordersToSync.entries()) {
      try {
        log(
          `[${i + 1}/${ordersToSync.length}] Creating order #${order.order_id} for ${order.firstname} ${order.lastname}`,
        );

        const shopifyCustomerGid = customerMapByLocal.get(order.customer_id);

        // Build line items with variant matching
        const lineItems: Record<string, any>[] = [];
        for (const p of order.products) {
          const item: Record<string, any> = {
            title: p.name,
            quantity: p.quantity,
            price: Number(p.price).toFixed(2),
          };

          const shopifyProductGid = productMapByLocal.get(p.product_id);
          if (shopifyProductGid) {
            const variants = await getVariantsForProduct(shopifyProductGid);

            // Get order options for this specific order_product
            const productOptions = order.options.filter(
              (o) => o.order_product_id === p.order_product_id,
            );

            let matchedVariant: { id: string } | undefined;

            if (productOptions.length === 0) {
              // No options — single variant product, use first variant
              matchedVariant = variants[0];
            } else {
              // Match variant by comparing selectedOptions with order options
              matchedVariant = variants.find((v) => {
                // Every order option must match a selectedOption on the variant
                return productOptions.every((orderOpt) =>
                  v.selectedOptions.some(
                    (so) =>
                      so.name === orderOpt.name && so.value === orderOpt.value,
                  ),
                );
              });
            }

            if (matchedVariant) {
              item.variant_id = Number(
                extractShopifyNumericId(matchedVariant.id),
              );
            }
          }

          lineItems.push(item);
        }

        if (lineItems.length === 0) {
          log(
            `[${i + 1}/${ordersToSync.length}] Skipping: no line items`,
          );
          continue;
        }

        const fulfillmentStatus = mapFulfillmentStatus(order.order_status_id);

        const orderPayload: Record<string, any> = {
          order: {
            line_items: lineItems,
            financial_status: "paid",
            currency: order.currency_code || "UAH",
            created_at: order.date_added.toISOString(),
            closed_at: order.date_modified.toISOString(),
            tags: "imported",
            note: order.comment || undefined,
            shipping_address: {
              first_name: order.shipping_firstname,
              last_name: order.shipping_lastname,
              company: order.shipping_company || undefined,
              address1: order.shipping_address_1,
              address2: order.shipping_address_2 || undefined,
              city: order.shipping_city,
              zip: order.shipping_postcode,
              country: order.shipping_country || "Ukraine",
              province: order.shipping_zone || undefined,
            },
            billing_address: {
              first_name: order.payment_firstname,
              last_name: order.payment_lastname,
              company: order.payment_company || undefined,
              address1: order.payment_address_1,
              address2: order.payment_address_2 || undefined,
              city: order.payment_city,
              zip: order.payment_postcode,
              country: order.payment_country || "Ukraine",
              province: order.payment_zone || undefined,
            },
          },
        };

        if (fulfillmentStatus) {
          orderPayload.order.fulfillment_status = fulfillmentStatus;
        }

        if (shopifyCustomerGid) {
          orderPayload.order.customer = {
            id: Number(extractShopifyNumericId(shopifyCustomerGid)),
          };
        } else if (order.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(order.email)) {
          orderPayload.order.email = order.email;
        }

        // Add shipping cost from totals if present
        const shippingTotal = order.totals.find((t) => t.code === "shipping");
        if (shippingTotal && Number(shippingTotal.value) > 0) {
          orderPayload.order.shipping_lines = [
            {
              title: shippingTotal.title || "Shipping",
              price: Number(shippingTotal.value).toFixed(2),
            },
          ];
        }

        let responseData: any;
        let response: Response | undefined;
        const maxRetries = 3;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
          response = await fetch(
            `https://${domain}/admin/api/${API_VERSION}/orders.json`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Shopify-Access-Token": accessToken,
              },
              body: JSON.stringify(orderPayload),
            },
          );

          responseData = await response.json();

          if (response.ok) break;

          const errorMsg = responseData?.errors
            ? JSON.stringify(responseData.errors)
            : response.statusText;

          if (response.status === 429 || errorMsg.includes("rate limit")) {
            const waitSec = 60 * (attempt + 1);
            log(
              `[${i + 1}/${ordersToSync.length}] Rate limited, waiting ${waitSec}s (attempt ${attempt + 1}/${maxRetries})...`,
            );
            await new Promise((r) => setTimeout(r, waitSec * 1000));
            continue;
          }

          log(`[${i + 1}/${ordersToSync.length}] Error: ${errorMsg}`);
          break;
        }

        if (!response?.ok) {
          continue;
        }

        const shopifyOrderId = String(responseData.order?.id);
        if (!shopifyOrderId || shopifyOrderId === "undefined") {
          log(
            `[${i + 1}/${ordersToSync.length}] Error: No order ID returned`,
          );
          continue;
        }

        await prisma.orderMap.upsert({
          where: { localOrderId: order.order_id },
          update: { shopifyOrderId },
          create: {
            localOrderId: order.order_id,
            shopifyOrderId,
          },
        });

        log(
          `[${i + 1}/${ordersToSync.length}] Created: Shopify order ${shopifyOrderId}`,
        );
      } catch (e: any) {
        log(
          `[${i + 1}/${ordersToSync.length}] Error: ${e.message}`,
        );
      }
    }

    log(`Order sync completed`);
    return logs;
  } catch (e: any) {
    logs.push(`Error: ${e.message}`);
    throw Object.assign(new Error(`Error syncing orders: ${e.message}`), {
      logs,
    });
  }
};
