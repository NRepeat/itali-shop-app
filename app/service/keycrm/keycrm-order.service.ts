import { KEYCRM_CONFIG } from "@shared/config/keycrm";
import type { KeyCrmOrderStatus } from "@shared/lib/queue/keycrm-order.queue";
import { client } from "../sync/client/shopify";
import { prisma } from "@shared/lib/prisma/prisma.server";

const GET_PRODUCTS_QUERY = `
  query getProducts($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Product {
        id
        featuredImage { url }
        metafield(namespace: "custom", key: "znizka") {
          value
        }
        variants(first: 100) {
          nodes {
            id
            image { url }
            price
            sku
            selectedOptions {
              name
              value
            }
          }
        }
      }
    }
  }
`;

const GET_DISCOUNT_CODES = `
query {
        discountNodes(first: 50) {
          edges {
            node {
              id
              discount {
                ... on DiscountCodeBasic {
                  title
                  status
                  customerGets {
                    value {
                      ... on DiscountPercentage {
                        percentage
                      }
                      ... on DiscountAmount {
                        amount {
                          amount
                          currencyCode
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
`;

interface VariantData {
  imageUrl: string | null;
  selectedOptions: Array<{ name: string; value: string }>;
  znizka: number; // discount % from metafield, 0 if none
  price: number;
  sku: string | null;
}

async function getOrderDiscountFromOrderNote(
  note: string,
  shop: string,
): Promise<{ percentage: number; amount: number; code: string } | null> {
  try {
    // 1. Extract and Clean Code
    const match = note.match(/Промокод:\s*([^\s\n]+)/);
    const codeFromNote = match ? match[1].trim().toLowerCase() : null;

    if (!codeFromNote) return null;

    // 2. Database & Session Setup
    const session = await prisma.session.findFirst({
      where: { shop },
      select: { accessToken: true },
    });

    if (!session?.accessToken) return null;

    // 3. API Request
    const response = await client.request<any>({
      query: GET_DISCOUNT_CODES,
      accessToken: session.accessToken,
      shopDomain: shop,
    });

    // CRITICAL FIX: Checking both response.discountNodes and response.data.discountNodes
    // depending on how your specific client library parses JSON
    const edges =
      response?.discountNodes?.edges ||
      response?.data?.discountNodes?.edges ||
      [];

    // 4. Find the matching node
    const matchedEdge = edges.find((edge: any) => {
      return edge.node.discount?.title?.trim().toLowerCase() === codeFromNote;
    });

    // 5. Build Result
    if (matchedEdge && matchedEdge.node.discount.status === "ACTIVE") {
      const discount = matchedEdge.node.discount;
      const value = discount.customerGets?.value;

      return {
        code: discount.title, // Return original case (e.g., WELCOME-5)
        percentage: value?.percentage ? value.percentage * 100 : 0,
        amount: value?.amount?.amount ? parseFloat(value.amount.amount) : 0,
      };
    }

    return null; // Return null if no ACTIVE match was found
  } catch (error) {
    console.error("Error in getOrderDiscountFromOrderNote:", error);
    return null;
  }
}

async function fetchProductVariants(
  shop: string,
  productIds: string[],
): Promise<Map<string, Map<string, VariantData>>> {
  const result = new Map<string, Map<string, VariantData>>();
  if (productIds.length === 0) return result;

  const session = await prisma.session.findFirst({
    where: { shop },
    select: { accessToken: true },
  });
  if (!session?.accessToken) return result;

  const gids = productIds.map((id) => `gid://shopify/Product/${id}`);

  const data = await client.request<{ nodes: any[] }, { ids: string[] }>({
    query: GET_PRODUCTS_QUERY,
    variables: { ids: gids },
    accessToken: session.accessToken,
    shopDomain: shop,
  });

  for (const node of data.nodes) {
    if (!node?.id) continue;
    const numericId = node.id.replace("gid://shopify/Product/", "");
    const znizka = Number(node.metafield?.value || "0") || 0;
    const variants = new Map<string, VariantData>();

    for (const variant of node.variants?.nodes || []) {
      const variantId = variant.id.replace("gid://shopify/ProductVariant/", "");
      variants.set(variantId, {
        imageUrl: variant.image?.url || node.featuredImage?.url || null,
        selectedOptions: variant.selectedOptions || [],
        znizka,
        price: parseFloat(variant.price || "0"),
        sku: variant.sku || null,
      });
    }

    result.set(numericId, variants);
  }

  return result;
}

interface KeyCrmBuyer {
  full_name: string;
  email?: string;
  phone?: string;
}

interface KeyCrmProduct {
  sku?: string;
  price: number;
  purchased_price?: number;
  quantity: number;
  name: string;
  picture?: string;
  properties?: Array<{ name: string; value: string }>;
  discount_percent?: number;
  discount_amount?: number;
}

interface KeyCrmShipping {
  shipping_address_city?: string;
  shipping_address_country?: string;
  shipping_address_region?: string;
  shipping_address_zip?: string;
  shipping_receive_point?: string;
}

interface KeyCrmPayment {
  payment_method: string;
  amount: number;
  status: string;
}

interface KeyCrmOrder {
  source_id: number;
  source_uuid: string;
  buyer: KeyCrmBuyer;
  products: KeyCrmProduct[];
  shipping?: KeyCrmShipping;
  shipping_price?: number;
  discount_amount?: number;
  discount_percent?: number;
  promocode?: string;
  ordered_at?: string;
  payments?: KeyCrmPayment[];
  buyer_comment?: string;
  manager_comment?: string;
}

const STATUS_MAP: Record<KeyCrmOrderStatus, number> = {
  INITIALIZED: KEYCRM_CONFIG.statuses.new,
  IN_PROGRESS: KEYCRM_CONFIG.statuses.confirmed,
  DELIVERED: KEYCRM_CONFIG.statuses.shipped,
  CANCELLED: KEYCRM_CONFIG.statuses.cancelled,
};

export function getKeyCrmStatusId(status: KeyCrmOrderStatus): number {
  return STATUS_MAP[status];
}

function extractCustomerNote(
  combinedNote: string | undefined,
): string | undefined {
  // The combined note from create.ts follows this format:
  //   [customer note if present]
  //   Метод оплати: X
  //   Промокод: Y
  //   ⚠️ Не телефонуйте... (Viber preference)
  // We want only the customer-facing parts (non-technical lines).
  // Strategy: exclude lines starting with "Метод оплати:" or "Промокод:"
  if (!combinedNote) return undefined;
  const lines = combinedNote.split("\n").filter((line) => {
    const trimmed = line.trim();
    return (
      trimmed.length > 0 &&
      !trimmed.startsWith("Метод оплати:") &&
      !trimmed.startsWith("Промокод:")
    );
  });
  return lines.length > 0 ? lines.join("\n") : undefined;
}

function buildManagerComment(payload: Record<string, any>): string | undefined {
  const parts: string[] = [];

  // Payment method from direct payload field
  const paymentMethod = payload.payment_gateway_names?.[0];
  if (paymentMethod && paymentMethod !== "unknown") {
    parts.push(`Метод оплати: ${paymentMethod}`);
  }
  const appliedDiscount = payload.applied_discount as { type: string; title: string } | null | undefined;
  if (appliedDiscount?.type === 'discount_code' && appliedDiscount.title) {
    parts.push(`Промокод: ${appliedDiscount.title}`);
  }

  return parts.length > 0 ? parts.join("\n") : undefined;
}

export async function mapShopifyOrderToKeyCrm(
  payload: Record<string, any>,
  shop: string,
): Promise<KeyCrmOrder> {
  const customer = payload.customer || {};
  const shippingAddress = payload.shipping_address;
  const noteAttributes: Array<{ name: string; value: string }> =
    payload.note_attributes || [];

  // Extract customer info from note_attributes (quick orders)
  const noteAttr = (name: string) =>
    noteAttributes.find((a) => a.name === name)?.value;
  const isQuickOrder = noteAttr("_quick_order") === "true";

  const fullName =
    customer.first_name || customer.last_name
      ? [customer.first_name, customer.last_name].filter(Boolean).join(" ")
      : noteAttr("_customer_name") || "Unknown";

  const email =
    payload.email ||
    customer.email ||
    (isQuickOrder ? "skip@dummyemail.com" : undefined);
  const phone = payload.phone || customer.phone || noteAttr("_customer_phone");

  const buyer: KeyCrmBuyer = {
    full_name: fullName,
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
  };

  const lineItems: any[] = payload.line_items || [];

  // Fetch product images from Shopify
  const productIds = [
    ...new Set(
      lineItems
        .map((item: any) => String(item.product_id))
        .filter((id: string) => id && id !== "null" && id !== "undefined"),
    ),
  ];

  let productVariants = new Map<string, Map<string, VariantData>>();
  try {
    productVariants = await fetchProductVariants(shop, productIds);
  } catch (error) {
    console.warn("Failed to fetch product variants from Shopify:", error);
  }

  // Use pre-calculated discount from payload (set by nnshop createOrder).
  // Falls back to note-parsing for legacy webhooks that don't include applied_discount.
  const payloadDiscount = payload.applied_discount as {
    type: string; title: string; amount: string;
  } | null | undefined;
  const discountAmount = payloadDiscount?.amount
    ? Math.round(parseFloat(payloadDiscount.amount))
    : 0;
  const promocodeFromPayload = payloadDiscount?.type === 'discount_code'
    ? payloadDiscount.title
    : undefined;

  let totalCatalogTotal = 0;
  let originTotalCatalogTotal = 0;

  const products: KeyCrmProduct[] = lineItems.map((item: any) => {
    const nameParts = [item.title, item.variant_title].filter(Boolean);
    const variants = productVariants.get(String(item.product_id));
    const variantData = variants?.get(String(item.variant_id));
    const imageUrl = variantData?.imageUrl || null;

    const properties: Array<{ name: string; value: string }> = (
      variantData?.selectedOptions || []
    ).filter((opt) => opt.name !== "Title" && opt.value !== "Default Title");

    const znizka = variantData?.znizka ?? 0;

    // The "First Price" (original price) is the base catalog price.
    const originalPrice = variantData
      ? variantData.price
      : parseFloat(item.price || "0");

    // The "Second Price" (purchased price) is the catalog price after 'znizka'
    // but BEFORE any extra checkout-level discounts.
    const lastItemPriceDiscount = (originalPrice * znizka) / 100;

    const subdivisionPrice = originalPrice - lastItemPriceDiscount;
    const purchasedPrice = Math.round(subdivisionPrice);

    const roundedOriginalPrice = Math.round(originalPrice);

    totalCatalogTotal += purchasedPrice * item.quantity;
    originTotalCatalogTotal += roundedOriginalPrice * item.quantity;

    const sku = item.sku || variantData?.sku;

    return {
      name: nameParts.join(" - "),
      price: roundedOriginalPrice,
      purchased_price: purchasedPrice,
      quantity: item.quantity,
      ...(znizka > 0
        ? {
            discount_amount:
              subdivisionPrice > 0
                ? Math.round(lastItemPriceDiscount)
                : undefined,
          }
        : {}),
      ...(sku ? { sku } : {}),
      ...(imageUrl ? { picture: imageUrl } : {}),
      ...(properties.length > 0 ? { properties } : {}),
    };
  });

  const shippingPrice = 0;

  const expectedTotalPrice = totalCatalogTotal + shippingPrice;
  const orderLevelDiscount = discountAmount;
  const promocode = promocodeFromPayload;

  console.log(
    promocode,
    orderLevelDiscount,
    originTotalCatalogTotal,
    expectedTotalPrice,
    "orderLevelDiscount,originTotalCatalogTotal,expectedTotalPrice",
  );
  const shipping: KeyCrmShipping | undefined = shippingAddress
    ? {
        ...(shippingAddress.city
          ? { shipping_address_city: shippingAddress.city }
          : {}),
        ...(shippingAddress.country
          ? { shipping_address_country: shippingAddress.country }
          : {}),
        ...(shippingAddress.province
          ? { shipping_address_region: shippingAddress.province }
          : {}),
        ...(shippingAddress.zip
          ? { shipping_address_zip: shippingAddress.zip }
          : {}),
        ...([shippingAddress.address1, shippingAddress.address2]
          .filter(Boolean)
          .join(", ")
          ? {
              shipping_receive_point: [
                shippingAddress.address1,
                shippingAddress.address2,
              ]
                .filter(Boolean)
                .join(", "),
            }
          : {}),
      }
    : undefined;

  const financialStatus = payload.financial_status || "";
  const paymentMethod = payload.payment_gateway_names?.[0] || "unknown";
  const totalPrice = expectedTotalPrice - orderLevelDiscount;

  const payments: KeyCrmPayment[] = [
    {
      payment_method: paymentMethod,
      amount: Math.round(totalPrice),
      status: financialStatus === "paid" ? "paid" : "not_paid",
    },
  ];

  const orderedAt = payload.created_at
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/Kyiv",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      })
        .format(new Date(payload.created_at))
        .replace(/(\d+)\/(\d+)\/(\d+), (\d+):(\d+):(\d+)/, "$3-$2-$1 $4:$5:$6")
    : undefined;

  return {
    source_id: KEYCRM_CONFIG.sourceId,
    source_uuid: String(payload.name || payload.id),
    buyer,
    products,
    promocode: promocode ? promocode : "",
    ...(shipping ? { shipping } : {}),
    ...(shippingPrice > 0 ? { shipping_price: Math.round(shippingPrice) } : {}),
    ...(orderLevelDiscount > 0 ? { discount_amount: orderLevelDiscount } : {}),
    ...(orderedAt ? { ordered_at: orderedAt } : {}),
    payments,
    ...(buildManagerComment(payload)
      ? { manager_comment: buildManagerComment(payload) }
      : {}),
    ...(extractCustomerNote(payload.note)
      ? { buyer_comment: extractCustomerNote(payload.note) }
      : {}),
  };
}

export async function createOrderInKeyCrm(
  order: KeyCrmOrder,
): Promise<{ id: number }> {
  const response = await fetch(`${KEYCRM_CONFIG.baseUrl}/order`, {
    method: "POST",
    headers: {
      Authorization: KEYCRM_CONFIG.authHeader,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(order),
  });
  console.log(order, "createOrderInKeyCrm", response);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `keyCRM API error (POST /order): ${response.status} ${response.statusText} — ${body}`,
    );
  }

  const data = await response.json();
  console.log(
    `keyCRM order created: ${order.source_uuid} → keyCRM ID ${data.id}`,
  );
  return data;
}

export async function updateOrderInKeyCrm(
  keycrmOrderId: number,
  data: Record<string, any>,
): Promise<void> {
  const response = await fetch(
    `${KEYCRM_CONFIG.baseUrl}/order/${keycrmOrderId}`,
    {
      method: "PUT",
      headers: {
        Authorization: KEYCRM_CONFIG.authHeader,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(data),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `keyCRM API error (PUT /order/${keycrmOrderId}): ${response.status} ${response.statusText} — ${body}`,
    );
  }

  console.log(`keyCRM order ${keycrmOrderId} updated successfully`);
}

export async function fetchKeyCrmOrderTracking(
  keycrmOrderId: number,
): Promise<string | undefined> {
  const response = await fetch(
    `${KEYCRM_CONFIG.baseUrl}/order/${keycrmOrderId}?include=shipping`,
    {
      method: "GET",
      headers: {
        Authorization: KEYCRM_CONFIG.authHeader,
        Accept: "application/json",
      },
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `keyCRM API error (GET /order/${keycrmOrderId}): ${response.status} ${response.statusText} — ${body}`,
    );
  }

  const data = await response.json();
  console.log(
    `[fetchKeyCrmOrderTracking] order ${keycrmOrderId} response keys:`,
    Object.keys(data),
  );
  // KeyCRM single-order endpoint may wrap in a `data` object
  const order = data?.data ?? data;
  const rawTtn = order?.shipping?.tracking_code;
  console.log(`[fetchKeyCrmOrderTracking] tracking_code:`, rawTtn);
  return typeof rawTtn === "string" && rawTtn.trim()
    ? rawTtn.trim()
    : undefined;
}

export async function fetchKeyCrmOrderPayments(
  keycrmOrderId: number,
): Promise<Array<{ id: number; status: string }>> {
  const response = await fetch(
    `${KEYCRM_CONFIG.baseUrl}/order/${keycrmOrderId}?include=payments`,
    {
      method: "GET",
      headers: {
        Authorization: KEYCRM_CONFIG.authHeader,
        Accept: "application/json",
      },
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `keyCRM API error (GET /order/${keycrmOrderId}?include=payments): ${response.status} ${response.statusText} — ${body}`,
    );
  }

  const data = await response.json();
  const order = data?.data ?? data;
  return order?.payments ?? [];
}

export async function markKeyCrmPaymentAsPaid(
  keycrmOrderId: number,
  paymentId: number,
): Promise<void> {
  const response = await fetch(
    `${KEYCRM_CONFIG.baseUrl}/order/${keycrmOrderId}/payment/${paymentId}`,
    {
      method: "PUT",
      headers: {
        Authorization: KEYCRM_CONFIG.authHeader,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ status: "paid" }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `keyCRM API error (PUT /order/${keycrmOrderId}/payment/${paymentId}): ${response.status} ${response.statusText} — ${body}`,
    );
  }

  console.log(`keyCRM payment ${paymentId} on order ${keycrmOrderId} marked as paid`);
}

export async function findKeyCrmOrderBySourceUuid(
  sourceUuid: string,
): Promise<{ id: number } | null> {
  const url = new URL(`${KEYCRM_CONFIG.baseUrl}/order`);
  url.searchParams.set("filter[source_uuid]", sourceUuid);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: KEYCRM_CONFIG.authHeader,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `keyCRM API error (GET /order): ${response.status} ${response.statusText} — ${body}`,
    );
  }

  const data = await response.json();
  if (data.data && data.data.length > 0) {
    return { id: data.data[0].id };
  }

  return null;
}
