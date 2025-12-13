
import { externalDB } from "@shared/lib/prisma/prisma.server";
import syncQueue from "@shared/lib/queue";

export const syncProducts = async (domain: string, accessToken: string) => {
  try {
    const allProducts = await externalDB.bc_product.findMany({
      where: {
        status: true,
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
    for (const product of allProducts.splice(0,10)) {
      await syncQueue.add("sync-queue", {
        product,
        domain,
        shop: domain,
        accessToken,
      });
    }
  } catch (e) {
    throw new Error(`Error syncing products: ${e.message}`);
  }
};
