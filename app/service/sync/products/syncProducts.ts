import { externalDB, prisma } from "@shared/lib/prisma/prisma.server";
import syncQueue from "@shared/lib/queue";
import { client } from "@shared/lib/shopify/client/client";
import { linkProducts } from "./link-products";

export const syncProducts = async (domain: string, accessToken: string) => {
  try {
    const syncedProducts = await prisma.productMap.findMany();
    const allProducts = await externalDB.bc_product.findMany({
      where: {
        status: true,
        quantity: {
          gt: 0,
        },
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
    // const query = `
    //   query getProductByIds($query: String!) {
    //        productByHandle(handle:$query) {

    //            id

    //        }
    //      }
    // `
    // const getShopifyProductId = async (productId: string) => {
    //   const product = await client.request({
    //     query,accessToken:accessToken,shopDomain:domain,variables:{query:`${productId}`}
    //   });
    //   return product
    // };

    const productToUpdate = allProducts.filter(
      (product) =>
        syncedProducts.some(
          (syncedProduct) =>
            syncedProduct.localProductId === product.product_id,
        ),
    );
    console.log("productToUpdate",productToUpdate.length)
    // return
    for (const product of productToUpdate) {
      if (product.model) {
        console.log("product", product.model);
        await linkProducts(product,accessToken,domain)
        // const productDes = await externalDB.bc_product_description.findFirst({where:{product_id:product.product_id,language_id:3}})
        // if(productDes){
        //   console.log("productDes",productDes)
        //   const shopifyProductId = await getShopifyProductId(productDes.seo_keyword)
        //   console.log("shopifyProductId",shopifyProductId)
        //   const shopidyId = shopifyProductId?.productByHandle?.id
        //   if(shopidyId){
        //     console.log("shopidyId",shopidyId)
        //     await prisma.productMap.upsert({
        //       where:{localProductId:product.product_id},
        //       update:{shopifyProductId:shopidyId},
        //       create:{localProductId:product.product_id,shopifyProductId:shopidyId}
        //     })
        //   }
        // }
        // await syncQueue.add("sync-queue", {
        //   product,
        //   domain,
        //   shop: domain,
        //   accessToken,
        // });
      }
    }
  } catch (e) {
    throw new Error(`Error syncing products: ${e.message}`);
  }
};
