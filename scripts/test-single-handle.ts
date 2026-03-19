
import { prisma } from "../app/shared/lib/prisma/prisma.server";
import { client as shopifyClient } from "../app/shared/lib/shopify/client/client";
import { googleMerchantSyncQueue } from "../app/service/sync/queues";

async function main() {
  const handle = "pleteni-slingbeky-gioseppo-chorni-68238";
  
  const session = await prisma.session.findFirst({
    select: { shop: true, accessToken: true },
  });

  if (!session?.accessToken || !session.shop) {
    console.error("No Shopify session found");
    return;
  }

  const GET_PRODUCT_BY_HANDLE = `#graphql
    query getProductByHandle($handle: String!) {
      productByHandle(handle: $handle) {
        id
        handle
      }
    }
  `;

  const response: any = await shopifyClient.request({
    query: GET_PRODUCT_BY_HANDLE,
    variables: { handle },
    accessToken: session.accessToken,
    shopDomain: session.shop,
  });

  if (!response.productByHandle) {
    console.error(`Product with handle "${handle}" not found in Shopify`);
    return;
  }

  const product = response.productByHandle;
  const numericId = product.id.split("/").pop();
  
  console.log(`Found product ${product.handle} with ID ${product.id}`);
  
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.miomio.com.ua";
  
  await googleMerchantSyncQueue.add(`test-sync-${product.handle}`, {
    payload: { id: product.id, handle: product.handle },
    shop: session.shop,
    baseUrl,
  }, {
    jobId: `test-${numericId}-${Date.now()}`,
    removeOnComplete: true,
  });

  console.log(`Added test-sync job for ${product.handle} to queue.`);
  process.exit(0);
}

main().catch(console.error);
