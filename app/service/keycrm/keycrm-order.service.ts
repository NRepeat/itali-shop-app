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

interface VariantData {
  imageUrl: string | null;
  selectedOptions: Array<{ name: string; value: string }>;
  znizka: number; // discount % from metafield, 0 if none
}

async function fetchProductVariants(
  shop: string,
  productIds: string[]
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
  quantity: number;
  name: string;
  picture?: string;
  properties?: Array<{ name: string; value: string }>;
  discount_percent?: number;
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

function extractCustomerNote(combinedNote: string | undefined): string | undefined {
  // The combined note from create.ts follows this format:
  //   [customer note if present]
  //   Метод оплати: X
  //   Промокод: Y
  //   ⚠️ Не телефонуйте... (Viber preference)
  // We want only the customer-facing parts (non-technical lines).
  // Strategy: exclude lines starting with "Метод оплати:" or "Промокод:"
  if (!combinedNote) return undefined;
  const lines = combinedNote.split('\n').filter(line => {
    const trimmed = line.trim();
    return trimmed.length > 0
      && !trimmed.startsWith('Метод оплати:')
      && !trimmed.startsWith('Промокод:');
  });
  return lines.length > 0 ? lines.join('\n') : undefined;
}

function buildManagerComment(payload: Record<string, any>): string | undefined {
  const parts: string[] = [];

  // Payment method from direct payload field
  const paymentMethod = payload.payment_gateway_names?.[0];
  if (paymentMethod && paymentMethod !== 'unknown') {
    parts.push(`Метод оплати: ${paymentMethod}`);
  }

  // Discount codes from direct payload field (NOT parsed from note string)
  const discountCodes: string[] = (payload.discount_codes || [])
    .map((d: any) => d.code)
    .filter(Boolean);
  if (discountCodes.length > 0) {
    parts.push(`Промокод: ${discountCodes.join(', ')}`);
  }

  return parts.length > 0 ? parts.join('\n') : undefined;
}

export async function mapShopifyOrderToKeyCrm(
  payload: Record<string, any>,
  shop: string
): Promise<KeyCrmOrder> {
  const customer = payload.customer || {};
  const shippingAddress = payload.shipping_address;
  const noteAttributes: Array<{ name: string; value: string }> = payload.note_attributes || [];

  // Extract customer info from note_attributes (quick orders)
  const noteAttr = (name: string) => noteAttributes.find((a) => a.name === name)?.value;
  const isQuickOrder = noteAttr("_quick_order") === "true";

  const fullName = customer.first_name || customer.last_name
    ? [customer.first_name, customer.last_name].filter(Boolean).join(" ")
    : noteAttr("_customer_name") || "Unknown";

  const email = payload.email || customer.email || (isQuickOrder ? "skip@dummyemail.com" : undefined);
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
        .filter((id: string) => id && id !== "null" && id !== "undefined")
    ),
  ];

  let productVariants = new Map<string, Map<string, VariantData>>();
  try {
    productVariants = await fetchProductVariants(shop, productIds);
  } catch (error) {
    console.warn("Failed to fetch product variants from Shopify:", error);
  }

  const products: KeyCrmProduct[] = lineItems.map((item: any) => {
    const nameParts = [item.title, item.variant_title].filter(Boolean);
    const variants = productVariants.get(String(item.product_id));
    const variantData = variants?.get(String(item.variant_id));
    const imageUrl = variantData?.imageUrl || null;

    const properties: Array<{ name: string; value: string }> = (
      variantData?.selectedOptions || []
    ).filter(
      (opt) => opt.name !== "Title" && opt.value !== "Default Title"
    );

    const finalPrice = parseFloat(item.price || "0");
    const znizka = variantData?.znizka ?? 0;
    const originalPrice = znizka > 0
      ? Math.round((finalPrice / (1 - znizka / 100)) * 100) / 100
      : finalPrice;

    return {
      name: nameParts.join(" - "),
      price: originalPrice,
      quantity: item.quantity,
      ...(znizka > 0 ? { discount_percent: znizka } : {}),
      ...(item.sku ? { sku: item.sku } : {}),
      ...(imageUrl ? { picture: imageUrl } : {}),
      ...(properties.length > 0 ? { properties } : {}),
    };
  });

  const shippingPrice = Array.isArray(payload.shipping_lines)
    ? payload.shipping_lines.reduce(
        (sum: number, line: any) => sum + parseFloat(line.price || "0"),
        0
      )
    : 0;

  const discountAmount = parseFloat(payload.total_discounts || "0");
  // subtotal_price is before discounts; discount_percent = discount / (subtotal + discount) * 100
  const subtotalPrice = parseFloat(payload.subtotal_price || "0");
  const discountBase = subtotalPrice + discountAmount;
  const discountPercent = discountAmount > 0 && discountBase > 0
    ? Math.round((discountAmount / discountBase) * 1000) / 10
    : 0;

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
  const totalPrice = parseFloat(payload.total_price || "0");

  const payments: KeyCrmPayment[] = [
    {
      payment_method: paymentMethod,
      amount: totalPrice,
      status: financialStatus === "paid" ? "paid" : "not_paid",
    },
  ];

  const orderedAt = payload.created_at
    ? new Date(payload.created_at).toISOString().replace("T", " ").slice(0, 19)
    : undefined;

  return {
    source_id: KEYCRM_CONFIG.sourceId,
    source_uuid: String(payload.name || payload.id),
    buyer,
    products,
    ...(shipping ? { shipping } : {}),
    ...(shippingPrice > 0 ? { shipping_price: shippingPrice } : {}),
    ...(discountAmount > 0 ? { discount_amount: discountAmount } : {}),
    ...(discountPercent > 0 ? { discount_percent: discountPercent } : {}),
    ...(orderedAt ? { ordered_at: orderedAt } : {}),
    payments,
    ...(buildManagerComment(payload) ? { manager_comment: buildManagerComment(payload) } : {}),
    ...(extractCustomerNote(payload.note) ? { buyer_comment: extractCustomerNote(payload.note) } : {}),
  };
}

export async function createOrderInKeyCrm(
  order: KeyCrmOrder
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

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `keyCRM API error (POST /order): ${response.status} ${response.statusText} — ${body}`
    );
  }

  const data = await response.json();
  console.log(
    `keyCRM order created: ${order.source_uuid} → keyCRM ID ${data.id}`
  );
  return data;
}

export async function updateOrderInKeyCrm(
  keycrmOrderId: number,
  data: Record<string, any>
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
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `keyCRM API error (PUT /order/${keycrmOrderId}): ${response.status} ${response.statusText} — ${body}`
    );
  }

  console.log(`keyCRM order ${keycrmOrderId} updated successfully`);
}

export async function fetchKeyCrmOrderTracking(
  keycrmOrderId: number
): Promise<string | undefined> {
  const response = await fetch(
    `${KEYCRM_CONFIG.baseUrl}/order/${keycrmOrderId}?include=shipping`,
    {
      method: "GET",
      headers: {
        Authorization: KEYCRM_CONFIG.authHeader,
        Accept: "application/json",
      },
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `keyCRM API error (GET /order/${keycrmOrderId}): ${response.status} ${response.statusText} — ${body}`
    );
  }

  const data = await response.json();
  console.log(`[fetchKeyCrmOrderTracking] order ${keycrmOrderId} response keys:`, Object.keys(data));
  // KeyCRM single-order endpoint may wrap in a `data` object
  const order = data?.data ?? data;
  const rawTtn = order?.shipping?.tracking_code;
  console.log(`[fetchKeyCrmOrderTracking] tracking_code:`, rawTtn);
  return typeof rawTtn === "string" && rawTtn.trim() ? rawTtn.trim() : undefined;
}

export async function findKeyCrmOrderBySourceUuid(
  sourceUuid: string
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
      `keyCRM API error (GET /order): ${response.status} ${response.statusText} — ${body}`
    );
  }

  const data = await response.json();
  if (data.data && data.data.length > 0) {
    return { id: data.data[0].id };
  }

  return null;
}
