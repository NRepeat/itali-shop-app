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
export const updateExistingProductLinks = async (
  accessToken: string,
  shopDomain: string,
  limit?: number,
  offset: number = 0
) => {
  const logs: string[] = [];
  const log = (msg: string) => {
    console.log(msg);
    logs.push(msg);
  };

  try {
    // Get products from external DB (not from local mapping)
    const totalCount = await externalDB.bc_product.count({
      where: {
        status: true,
        quantity: { gt: 0 },
      },
    });

    const products = await externalDB.bc_product.findMany({
      where: {
        status: true,
        quantity: { gt: 0 },
      },
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
        // Exclude date_available to avoid "Value out of range" error
      },
      skip: offset,
      ...(limit && { take: limit }), // Only apply limit if provided
    });

    log(`Total products in external DB: ${totalCount}`);
    log(`Processing ${products.length} products${limit ? ` (limited to ${limit})` : ' (ALL)'} (offset: ${offset})`);

    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;

    for (const [index, product] of products.entries()) {
      try {
        log(`[${index + 1}/${products.length}] Updating links for product ${product.product_id} (${product.model})`);

        await linkProducts(product, accessToken, shopDomain);

        successCount++;
        log(`[${index + 1}/${products.length}] Successfully updated product ${product.product_id}`);
      } catch (error: any) {
        errorCount++;
        log(`[${index + 1}/${products.length}] Error updating product ${product.product_id}: ${error.message}`);
      }
    }

    log(`\n=== Update Summary ===`);
    log(`Total processed: ${products.length}`);
    log(`Success: ${successCount}`);
    log(`Errors: ${errorCount}`);
    log(`Skipped: ${skippedCount}`);
    log(`====================\n`);

    return { logs, successCount, errorCount, skippedCount };
  } catch (error: any) {
    log(`Fatal error: ${error.message}`);
    throw Object.assign(new Error(`Error updating product links: ${error.message}`), {
      logs,
    });
  }
};
