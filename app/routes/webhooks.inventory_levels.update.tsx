import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { googleMerchantSyncQueue } from "@/service/sync/queues";
import { client as shopifyClient } from "@shared/lib/shopify/client/client";
import { prisma } from "@shared/lib/prisma/prisma.server";

const GET_PRODUCT_BY_INVENTORY_ITEM = `#graphql
  query getProductByInventoryItem($id: ID!) {
    inventoryItem(id: $id) {
      variant {
        product {
          id
          handle
        }
      }
    }
  }
`;

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  const inventoryItemId = (payload as any)?.inventory_item_id;
  if (!inventoryItemId) {
    return new Response(null, { status: 200 });
  }

  try {
    const session = await prisma.session.findFirst({
      where: { shop },
      select: { accessToken: true, shop: true },
    });

    if (!session?.accessToken) {
      console.error("[InventoryWebhook] No session found for shop", shop);
      return new Response(null, { status: 200 });
    }

    const res: any = await shopifyClient.request({
      query: GET_PRODUCT_BY_INVENTORY_ITEM,
      variables: { id: `gid://shopify/InventoryItem/${inventoryItemId}` },
      accessToken: session.accessToken,
      shopDomain: session.shop,
    });

    const product = res?.inventoryItem?.variant?.product;
    if (!product?.id) {
      console.warn("[InventoryWebhook] Could not resolve product for inventory_item_id", inventoryItemId);
      return new Response(null, { status: 200 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.miomio.com.ua";
    const numericId = product.id.split("/").pop();

    await googleMerchantSyncQueue.add(topic, {
      shop,
      topic,
      payload: { id: numericId, handle: product.handle },
      baseUrl,
    }, {
      jobId: `${numericId}${Date.now()}`,
      removeOnComplete: true,
    });

    console.log(`[InventoryWebhook] Queued Google Merchant sync for product ${product.handle} (${numericId})`);
  } catch (err) {
    console.error("[InventoryWebhook] Error processing inventory_levels/update:", err);
  }

  return new Response(null, { status: 200 });
};
