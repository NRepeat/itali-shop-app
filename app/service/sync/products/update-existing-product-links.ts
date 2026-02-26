import { externalDB, prisma } from "@shared/lib/prisma/prisma.server";
import { findShopifyProductBySku } from "@/service/shopify/products/api/find-shopify-product";
import { linkProducts } from "./link-products";

/**
 * Updates metafields (bound-products and recommended_products) for all active products.
 * For each product: tries ProductMap first (fast), falls back to Shopify SKU lookup,
 * and backfills ProductMap when found via SKU lookup.
 */

const WORKERS = 10;
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 5,
  delayMs = 1000,
): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      const isThrottled =
        error.message?.includes("Throttled") ||
        error.message?.includes("throttled") ||
        error.extensions?.code === "THROTTLED";

      if (isThrottled && attempt < retries) {
        const wait = delayMs * 2 ** attempt;
        console.log(`Throttled, retrying in ${wait}ms (attempt ${attempt + 1}/${retries})`);
        await sleep(wait);
        continue;
      }
      throw error;
    }
  }
  throw new Error("Max retries exceeded");
}

export const updateExistingProductLinks = async (
  accessToken: string,
  shopDomain: string,
  limit?: number,
  offset: number = 0,
) => {
  const logs: string[] = [];
  const log = (msg: string) => {
    console.log(msg);
    logs.push(msg);
  };

  try {
    const totalCount = await externalDB.bc_product.count({
      where: { status: true, quantity: { gt: 0 } },
    });

    const products = await externalDB.bc_product.findMany({
      where: { status: true, quantity: { gt: 0 } },
      select: { product_id: true, model: true },
      skip: offset,
      ...(limit && { take: limit }),
    });

    log(`Total active products in external DB: ${totalCount}`);
    log(`Processing ${products.length} products${limit ? ` (limited to ${limit})` : " (ALL)"} (offset: ${offset})`);

    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;

    let cursor = 0;
    const total = products.length;

    const worker = async () => {
      while (true) {
        const index = cursor++;
        if (index >= total) break;

        const product = products[index];
        try {
          // Try ProductMap first (fast path)
          let map = await prisma.productMap.findFirst({
            where: { localProductId: product.product_id },
            select: { shopifyProductId: true },
          });

          // Fall back to Shopify SKU lookup for products missing from ProductMap
          if (!map) {
            const shopifyId = await findShopifyProductBySku(product.model, accessToken, shopDomain);
            if (!shopifyId) {
              log(`[${index + 1}/${total}] SKIP ${product.product_id} (${product.model}) — not in Shopify`);
              skippedCount++;
              continue;
            }
            // Backfill ProductMap so future runs are fast
            await prisma.productMap.upsert({
              where: { localProductId: product.product_id },
              update: { shopifyProductId: shopifyId },
              create: { localProductId: product.product_id, shopifyProductId: shopifyId },
            });
            map = { shopifyProductId: shopifyId };
            log(`[${index + 1}/${total}] Backfilled ProductMap for ${product.product_id} → ${shopifyId}`);
          }

          log(`[${index + 1}/${total}] Updating links for product ${product.product_id}`);
          await withRetry(() =>
            linkProducts({ product_id: product.product_id, shopifyProductId: map!.shopifyProductId }, accessToken, shopDomain),
          );
          successCount++;
          log(`[${index + 1}/${total}] ✓ ${product.product_id}`);
        } catch (error: any) {
          errorCount++;
          log(`[${index + 1}/${total}] ✗ Error ${product.product_id}: ${error.message}`);
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(WORKERS, total) }, () => worker()),
    );

    log(`\n=== Update Summary ===`);
    log(`Total processed: ${total}`);
    log(`Success: ${successCount}`);
    log(`Errors: ${errorCount}`);
    log(`Skipped: ${skippedCount}`);
    log(`====================\n`);

    return { logs, successCount, errorCount, skippedCount };
  } catch (error: any) {
    log(`Fatal error: ${error.message}`);
    throw Object.assign(
      new Error(`Error updating product links: ${error.message}`),
      { logs },
    );
  }
};
