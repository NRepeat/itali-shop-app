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
  shop: string
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

    const imageUrl = productInfo
      ? productInfo.variantImages.get(String(item.variant_id)) ||
        productInfo.featuredImageUrl
      : null;

    const url = productInfo
      ? `https://app.miomio.com.ua/products/${productInfo.handle}`
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

  return {
    externalOrderId: String(payload.name || payload.id),
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
    items,
  };
}

export async function sendOrderToEsputnik(
  order: EsputnikOrder
): Promise<void> {
  const response = await fetch(`${ESPUTNIK_CONFIG.baseUrl}/orders`, {
    method: "POST",
    headers: {
      Authorization: ESPUTNIK_CONFIG.authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ orders: [order] }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `eSputnik API error: ${response.status} ${response.statusText} — ${body}`
    );
  }

  console.log(
    `eSputnik order ${order.externalOrderId} sent successfully (status: ${order.status})`
  );
}
