
import { externalDB, prisma } from "@shared/lib/prisma/prisma.server";
import syncQueue from "@shared/lib/queue";

export const syncProducts = async (domain: string, accessToken: string) => {
  try {
    const syncedProducts = await prisma.productMap.findMany()
    const allProducts = await externalDB.bc_product.findMany({
      where: {
        status: true,
        quantity: {
          gt: 0
        }
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
    await prisma.productMap.deleteMany({

    });
    console.log("deletrino done")
    console.log("allProducts",allProducts.length);
    const productToUpdate = allProducts.filter(product => !syncedProducts.some(syncedProduct => syncedProduct.localProductId === product.product_id));
    console.log("productToUpdate",productToUpdate.length);
    for (const product of allProducts.splice(0,1)) {
      console.log("product",product.model);
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
