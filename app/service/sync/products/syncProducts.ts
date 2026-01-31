import { externalDB, prisma } from "@shared/lib/prisma/prisma.server";
import { processSyncTask } from "./sync-product.worker";

export const syncProducts = async (
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
    const allProducts = await externalDB.bc_product.findMany({
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
      },
    });
    log(`Found ${allProducts.length} products in external DB`);

    const productsToCreate = limit ? allProducts.slice(0, limit) : allProducts;
    log(
      `Creating ${productsToCreate.length} products${limit ? ` (limited to ${limit})` : ""}`,
    );

    for (const [i, product] of productsToCreate.entries()) {
      try {
        log(
          `[${i + 1}/${productsToCreate.length}] Creating product: ${product.model || product.product_id}`,
        );
        const fakeJob = {
          data: { product, domain, shop: domain, accessToken },
        };
        await processSyncTask(fakeJob as any);
        log(
          `[${i + 1}/${productsToCreate.length}] Product ${product.model || product.product_id} created successfully`,
        );
      } catch (e: any) {
        log(
          `[${i + 1}/${productsToCreate.length}] Error creating product ${product.model || product.product_id}: ${e.message}`,
        );
      }
    }

    log(`Sync completed successfully`);
    return logs;
  } catch (e: any) {
    logs.push(`Error: ${e.message}`);
    throw Object.assign(new Error(`Error syncing products: ${e.message}`), {
      logs,
    });
  }
};
