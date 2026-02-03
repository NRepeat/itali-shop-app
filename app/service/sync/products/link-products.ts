import { externalDB } from "@shared/lib/prisma/prisma.server";
import { client } from "@shared/lib/shopify/client/client";
import { bc_product as Product } from "~/prisma/generated/external_client/client";
import { findShopifyProductBySku } from "@/service/shopify/products/api/find-shopify-product";

export const linkProducts = async (product:Product,accessToken:string,shopDomain:string) => {
try{
  // Find product in Shopify by SKU (not using local mapping)
  const currentProductShopifyId = await findShopifyProductBySku(
    product.model,
    accessToken,
    shopDomain,
  );

  console.log("currentProductShopifyId", currentProductShopifyId);

  if(!currentProductShopifyId){
    console.error(`Product ${product.model} not found in Shopify`);
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
    // Find related products in Shopify by SKU
    const shopifyRelatedIds: string[] = [];

    for (const relatedProduct of boundProducts) {
      const relatedProductData = await externalDB.bc_product.findUnique({
        where: { product_id: relatedProduct.product_id },
        select: {
          product_id: true,
          model: true,
          // Exclude date_available to avoid "Value out of range" error
        },
      });

      if (relatedProductData) {
        const shopifyId = await findShopifyProductBySku(
          relatedProductData.model,
          accessToken,
          shopDomain,
        );

        if (shopifyId && shopifyId !== currentProductShopifyId) {
          shopifyRelatedIds.push(shopifyId);
        }
      }
    }

    if(shopifyRelatedIds.length > 0){
      const variables = {
        "metafields": [{
          "key": "bound-products",
          "namespace": "custom",
          "ownerId": currentProductShopifyId,
          "type": "list.product_reference",
          "value": JSON.stringify(shopifyRelatedIds)
        }]
      }
      console.log("Shopify bound products:", JSON.stringify(variables));
      const response = await client.request({query:query,variables,accessToken,shopDomain})
      console.log("Bound products updated:", JSON.stringify(response));
    }
  }
  const relatedProducts = await externalDB
    .bc_product_related.findMany({
      where: { product_id: product.product_id },
    });

  if(relatedProducts.length > 0){
    // Find recommended products in Shopify by SKU
    const shopifyRecommendedIds: string[] = [];

    for (const relatedProduct of relatedProducts) {
      const relatedProductData = await externalDB.bc_product.findUnique({
        where: { product_id: relatedProduct.related_id },
        select: {
          product_id: true,
          model: true,
          // Exclude date_available to avoid "Value out of range" error
        },
      });

      if (relatedProductData) {
        const shopifyId = await findShopifyProductBySku(
          relatedProductData.model,
          accessToken,
          shopDomain,
        );

        if (shopifyId) {
          shopifyRecommendedIds.push(shopifyId);
        }
      }
    }

    if(shopifyRecommendedIds.length > 0){
      const variablesR = {
        "metafields": [{
          "key": "recommended_products",
          "namespace": "custom",
          "ownerId": currentProductShopifyId,
          "type": "list.product_reference",
          "value": JSON.stringify(shopifyRecommendedIds)
        }]
      }
      console.log("Shopify recommended products:", JSON.stringify(variablesR));
      const response = await client.request({query:query,variables:variablesR,accessToken,shopDomain})
      console.log("Recommended products updated:", JSON.stringify(response));
    }
  }

}
catch(error){
  console.error("Error linking products", error);
}
}
