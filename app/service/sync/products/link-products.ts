import { externalDB, prisma } from "@shared/lib/prisma/prisma.server";
import { client } from "@shared/lib/shopify/client/client";
import { bc_product as Product } from "~/prisma/generated/external_client/client";
export const linkProducts = async (product:Product,accessToken:string,shopDomain:string) => {
try{
  const rpoductShopifyIds = await prisma.productMap.findFirst({
    where: { localProductId: product.product_id },
  });
  console.log("rpoductShopifyIds",rpoductShopifyIds)
  if(!rpoductShopifyIds){
    console.error("Product not found in Shopify");
    return;
  }

  const query = `
    mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields {
          key
          namespace
          value
          createdAt
          updatedAt
        }
        userErrors {
          field
          message
          code
        }
      }
    }
    `
  const boundProducts = await externalDB.bc_product_related_article.findMany({
    where: { article_id: product.product_id },
  })
  if(boundProducts.length > 0){
    const shopifyRelatedIds = await prisma.productMap.findMany({
      where: { localProductId: { in: boundProducts.map(rp => rp.product_id) } },
    }).then(maps => maps.map(map => map.shopifyProductId))
    const value = shopifyRelatedIds.filter(id => id!== rpoductShopifyIds.shopifyProductId)
    if(value.length > 0){
      const veraibles = {
        "metafields": {
          "key": "bound-products",
          "namespace": "custom",
          "ownerId": rpoductShopifyIds.shopifyProductId,
          "type": "list.product_reference",
          "value": JSON.stringify(value)
        }
      }
      console.log("Shopify related IDs:", JSON.stringify(veraibles));
      const response = await client.request({query:query,variables:veraibles,accessToken,shopDomain})
      console.log("------------", JSON.stringify(response));
    }

  }
  // const relatedProducts = await externalDB
  //   .bc_product_related.findMany({
  //     where: { product_id: product.product_id },
  //   });
  // if(relatedProducts.length>0){
  //   const shopifyRelatedIds = await prisma.productMap.findMany({
  //     where: { localProductId: { in: relatedProducts.map(rp => rp.related_id) } },
  //   }).then(maps => maps.map(map => map.shopifyProductId));

    // if(shopifyRelatedIds.length > 0){
    //   const veraiblesR = {
    //     "metafields": {
    //       "key": "recommended_products",
    //       "namespace": "custom",
    //       "ownerId": rpoductShopifyIds.shopifyProductId,
    //       "type": "list.product_reference",
    //       "value": JSON.stringify(shopifyRelatedIds)
    //     }
    //   }
    //   console.log("Shopify related IDs:", JSON.stringify(veraiblesR));
    //   const response = await client.request({query:query,variables:veraiblesR,accessToken,shopDomain})
    //   console.log("veraiblesR","------------", JSON.stringify(response));
    // }
  // }

}
catch(error){
  console.error("Error linking products", error);
}
}
