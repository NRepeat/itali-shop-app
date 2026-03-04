import { ESPUTNIK_CONFIG } from "@shared/config/esputnik";
import type { EsputnikOrderStatus } from "@shared/lib/queue/esputnik-order.queue";
import { client } from "../sync/client/shopify";
import { prisma } from "@shared/lib/prisma/prisma.server";

interface EsputnikOrderItem {
  externalItemId: string;
  name: string;
  quantity: number;
  cost: number;
  url?: string;
  imageUrl?: string;
}

interface EsputnikOrder {
  externalOrderId: string;
  totalCost: number;
  status: EsputnikOrderStatus;
  date: string;
  currency: string;
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  shipping?: number;
  discount?: number;
  deliveryMethod?: string;
  paymentMethod?: string;
  deliveryAddress?: string;
  pickupAddress?: string;      // for READY_FOR_PICKUP template
  trackingNumber?: string;     // passed via Event API params only
  additionalInfo?: string;     // tracking number stored in order record (Orders API)
  items: EsputnikOrderItem[];
}

interface ProductInfo {
  handle: string;
  featuredImageUrl: string | null;
  variantImages: Map<string, string | null>;
}

const GET_PRODUCTS_QUERY = `
  query getProducts($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Product {
        id
        handle
        featuredImage {
          url
        }
        images(first: 100) {
          nodes {
            url
          }
        }
        variants(first: 100) {
          nodes {
            id
            image {
              url
            }
          }
        }
      }
    }
  }
`;

async function getAccessToken(shop: string): Promise<string> {
  const session = await prisma.session.findFirst({
    where: { shop },
    select: { accessToken: true },
  });

  if (!session?.accessToken) {
    throw new Error(`No access token found for shop: ${shop}`);
  }

  return session.accessToken;
}

async function fetchProductsInfo(
  shop: string,
  productIds: string[]
): Promise<Map<string, ProductInfo>> {
  const result = new Map<string, ProductInfo>();
  if (productIds.length === 0) return result;

  const accessToken = await getAccessToken(shop);
  const gids = productIds.map((id) => `gid://shopify/Product/${id}`);

  const data = await client.request<
    { nodes: any[] },
    { ids: string[] }
  >({
    query: GET_PRODUCTS_QUERY,
    variables: { ids: gids },
    accessToken,
    shopDomain: shop,
  });

  for (const node of data.nodes) {
    if (!node?.id) continue;
    const numericId = node.id.replace("gid://shopify/Product/", "");

    const productImages: string[] = (node.images?.nodes || [])
      .map((img: any) => img.url)
      .filter(Boolean);

    const variants = node.variants?.nodes || [];
    const variantImages = new Map<string, string | null>();

    for (let i = 0; i < variants.length; i++) {
      const variant = variants[i];
      const variantId = variant.id.replace(
        "gid://shopify/ProductVariant/",
        ""
      );
      const image =
        variant.image?.url || productImages[i] || productImages[0] || null;
      variantImages.set(variantId, image);
    }

    result.set(numericId, {
      handle: node.handle,
      featuredImageUrl: node.featuredImage?.url || null,
      variantImages,
    });
  }

  return result;
}

function getStorefrontDomain(shop: string): string {
  return shop.replace(".myshopify.com", "");
}

function formatDeliveryAddress(
  shippingAddress: Record<string, any> | null | undefined
): string | undefined {
  if (!shippingAddress) return undefined;

  const parts = [
    shippingAddress.address1,
    shippingAddress.address2,
    shippingAddress.city,
    shippingAddress.province,
    shippingAddress.zip,
    shippingAddress.country,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(", ") : undefined;
}

export async function mapShopifyOrderToEsputnik(
  payload: Record<string, any>,
  status: EsputnikOrderStatus,
  shop: string,
  extra?: { pickupAddress?: string; trackingNumber?: string }
): Promise<EsputnikOrder> {
  const lineItems: any[] = payload.line_items || [];

  const productIds = [
    ...new Set(
      lineItems
        .map((item: any) => String(item.product_id))
        .filter((id: string) => id && id !== "null" && id !== "undefined")
    ),
  ];

  let productsInfo = new Map<string, ProductInfo>();
  try {
    productsInfo = await fetchProductsInfo(shop, productIds);
  } catch (error) {
    console.warn("Failed to fetch product details from Shopify:", error);
  }

  const storefrontDomain = getStorefrontDomain(shop);

  const shippingTotal = Array.isArray(payload.shipping_lines)
    ? payload.shipping_lines.reduce(
        (sum: number, line: any) => sum + parseFloat(line.price || "0"),
        0
      )
    : 0;

  const items: EsputnikOrderItem[] = lineItems.map((item: any) => {
    const nameParts = [item.title, item.variant_title].filter(Boolean);
    const productInfo = productsInfo.get(String(item.product_id));

    const imageUrl = productInfo ? productInfo.featuredImageUrl : null;

    const url = productInfo
      ? `https://miomio.com.ua/products/${productInfo.handle}`
      : null;

    return {
      externalItemId: String(item.product_id || item.variant_id || ""),
      name: nameParts.join(" - "),
      quantity: item.quantity,
      cost: parseFloat(item.price || "0"),
      ...(url && { url }),
      ...(imageUrl && { imageUrl }),
    };
  });

  const externalOrderId = String(payload.name || payload.id);

  return {
    externalOrderId,
    totalCost: parseFloat(payload.total_price || "0"),
    status,
    date: payload.created_at,
    currency: payload.currency,
    ...(payload.email || payload.customer?.email
      ? { email: payload.email || payload.customer?.email }
      : {}),
    ...(payload.phone || payload.customer?.phone
      ? { phone: payload.phone || payload.customer?.phone }
      : {}),
    ...(payload.customer?.first_name && {
      firstName: payload.customer.first_name,
    }),
    ...(payload.customer?.last_name && {
      lastName: payload.customer.last_name,
    }),
    ...(shippingTotal > 0 && { shipping: shippingTotal }),
    ...(parseFloat(payload.total_discounts || "0") > 0 && {
      discount: parseFloat(payload.total_discounts),
    }),
    ...(payload.shipping_lines?.[0]?.title && {
      deliveryMethod: payload.shipping_lines[0].title,
    }),
    ...(payload.payment_gateway_names?.[0] && {
      paymentMethod: payload.payment_gateway_names[0],
    }),
    ...(formatDeliveryAddress(payload.shipping_address) && {
      deliveryAddress: formatDeliveryAddress(payload.shipping_address),
    }),
    ...(extra?.pickupAddress && { pickupAddress: extra.pickupAddress }),
    ...(extra?.trackingNumber && { additionalInfo: extra.trackingNumber }),
    items,
  };
}

// These statuses use /event endpoint so full order data is available in template via $data.get()
// IN_PROGRESS: tracking number passed as additionalInfo param → $data.get('additionalInfo')
const EVENT_API_STATUSES = new Set(["CONFIRMED", "IN_PROGRESS", "READY_FOR_PICKUP", "OUT_OF_STOCK"]);

export async function sendOrderToEsputnik(
  order: EsputnikOrder
): Promise<void> {
  if (EVENT_API_STATUSES.has(order.status)) {
    await sendOrderViaEventApi(order);
  } else {
    await sendOrderViaOrdersApi(order);
  }
}

async function sendOrderViaOrdersApi(order: EsputnikOrder): Promise<void> {
  const response = await fetch(`${ESPUTNIK_CONFIG.baseUrl}/orders`, {
    method: "POST",
    headers: {
      Authorization: ESPUTNIK_CONFIG.authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ orders: [order] }),
  });

  const body = await response.text();

  if (!response.ok) {
    throw new Error(
      `eSputnik orders API error: ${response.status} ${response.statusText} — ${body}`
    );
  }

  console.log(
    `eSputnik order ${order.externalOrderId} sent via Orders API (status: ${order.status}) — ${body}`
  );
}

async function sendOrderViaEventApi(order: EsputnikOrder): Promise<void> {
  const keyValue = order.email || order.phone;
  if (!keyValue) {
    throw new Error(
      `eSputnik event API requires email or phone for order ${order.externalOrderId}`
    );
  }

  const params: { name: string; value: string }[] = [
    { name: "orderId",         value: order.externalOrderId },
    { name: "externalOrderId", value: order.externalOrderId },
    { name: "totalCost",       value: String(order.totalCost) },
    { name: "currency",        value: order.currency },
    { name: "date",            value: order.date },
  ];

  if (order.firstName)       params.push({ name: "firstName",       value: order.firstName });
  if (order.lastName)        params.push({ name: "lastName",        value: order.lastName });
  if (order.phone)           params.push({ name: "phone",           value: order.phone });
  if (order.shipping)        params.push({ name: "shipping",        value: String(order.shipping) });
  if (order.discount)        params.push({ name: "discount",        value: String(order.discount) });
  if (order.deliveryMethod)  params.push({ name: "deliveryMethod",  value: order.deliveryMethod });
  if (order.paymentMethod)   params.push({ name: "paymentMethod",   value: order.paymentMethod });
  if (order.deliveryAddress) params.push({ name: "deliveryAddress", value: order.deliveryAddress });
  if (order.pickupAddress)   params.push({ name: "pickupAddress",   value: order.pickupAddress });
  if (order.trackingNumber)  params.push({ name: "trackingNumber",  value: order.trackingNumber });
  if (order.additionalInfo)  params.push({ name: "additionalInfo",  value: order.additionalInfo });

  const response = await fetch(`${ESPUTNIK_CONFIG.baseUrl}/event`, {
    method: "POST",
    headers: {
      Authorization: ESPUTNIK_CONFIG.authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      eventTypeKey: `order${order.status}`,
      keyValue,
      params,
    }),
  });

  const body = await response.text();

  if (!response.ok) {
    throw new Error(
      `eSputnik event API error: ${response.status} ${response.statusText} — ${body}`
    );
  }

  console.log(
    `eSputnik order ${order.externalOrderId} sent via Event API (status: ${order.status}) — ${body}`
  );
}
