import { externalDB } from "@shared/lib/prisma/prisma.server";
import { linkProducts } from "./link-products";

/**
 * Updates metafields (bound-products and recommended_products) for existing products
 * Fetches products directly from external DB and Shopify (no local mapping)
 * @param accessToken - Shopify access token
 * @param shopDomain - Shop domain
 * @param limit - Optional limit for testing (process only N products). If not provided, processes ALL products
 * @param offset - Optional offset to skip first N products
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
        const wait = delayMs * 2 ** attempt; // 1s, 2s, 4s, 8s, 16s
        console.log(
          `Throttled, retrying in ${wait}ms (attempt ${attempt + 1}/${retries})`,
        );
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
      select: {
        product_id: true,
        model: true,
        sku: true,
        upc: true,
        ean: true,
        jan: true,
        isbn: true,
        mpn: true,
        location: true,
        quantity: true,
        stock_status_id: true,
        image: true,
        manufacturer_id: true,
        shipping: true,
        price: true,
        points: true,
        tax_class_id: true,
        weight: true,
        weight_class_id: true,
        length: true,
        width: true,
        height: true,
        length_class_id: true,
        subtract: true,
        minimum: true,
        sort_order: true,
        status: true,
        viewed: true,
        noindex: true,
        af_values: true,
        af_tags: true,
        extra_special: true,
        import_batch: true,
        meta_robots: true,
        seo_canonical: true,
        new: true,
        rasprodaja: true,
      },
      skip: offset,
      ...(limit && { take: limit }),
    });

    log(`Total products in external DB: ${totalCount}`);
    log(
      `Processing ${products.length} products${limit ? ` (limited to ${limit})` : " (ALL)"} (offset: ${offset})`,
    );

    let successCount = 0;
    let errorCount = 0;
    const skippedCount = 0;

    // Queue-based worker pool
    let cursor = 0;
    const total = products.length;

    const worker = async () => {
      while (true) {
        const index = cursor++;
        if (index >= total) break;

        const product = products[index];
        try {
          log(
            `[${index + 1}/${total}] Updating links for product ${product.product_id} (${product.model})`,
          );
          await withRetry(() => linkProducts(product, accessToken, shopDomain));
          successCount++;
          log(`[${index + 1}/${total}] ✓ ${product.product_id}`);
        } catch (error: any) {
          errorCount++;
          log(
            `[${index + 1}/${total}] ✗ Error ${product.product_id}: ${error.message}`,
          );
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
