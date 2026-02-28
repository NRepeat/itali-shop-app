import { externalDB } from "@shared/lib/prisma/prisma.server";
import { client } from "@shared/lib/shopify/client/client";
import { findShopifyProductBySku } from "@/service/shopify/products/api/find-shopify-product";

const METAFIELDS_SET_MUTATION = `
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
`;

async function setMetafield(
  key: string,
  ownerId: string,
  value: string[],
  accessToken: string,
  shopDomain: string,
): Promise<void> {
  const variables = {
    metafields: [{
      key,
      namespace: "custom",
      ownerId,
      type: "list.product_reference",
      value: JSON.stringify(value),
    }],
  };
  const response: any = await client.request({
    query: METAFIELDS_SET_MUTATION,
    variables,
    accessToken,
    shopDomain,
  });
  const userErrors = response?.metafieldsSet?.userErrors ?? [];
  if (userErrors.length > 0) {
    const ownerGone = userErrors.some((e: any) => e.message === "Owner does not exist.");
    if (ownerGone) {
      throw new Error(`OWNER_NOT_FOUND:${ownerId}`);
    }
    throw new Error(userErrors.map((e: any) => e.message).join(", "));
  }
}

export const linkProducts = async (
  product: { product_id: number; shopifyProductId: string },
  accessToken: string,
  shopDomain: string,
) => {
  const currentProductShopifyId = product.shopifyProductId;

  try {
    // --- Bound products (bc_product_related_article) ---
    const boundArticles = await externalDB.bc_product_related_article.findMany({
      where: { article_id: product.product_id },
    });

    const shopifyRelatedIds: string[] = [];
    for (const article of boundArticles) {
      const relatedProduct = await externalDB.bc_product.findUnique({
        where: { product_id: article.product_id },
        select: { model: true },
      });
      if (relatedProduct) {
        const shopifyId = await findShopifyProductBySku(relatedProduct.model, accessToken, shopDomain);
        if (shopifyId && shopifyId !== currentProductShopifyId) {
          shopifyRelatedIds.push(shopifyId);
        }
      }
    }

    console.log(`[${product.product_id}] Setting bound-products: ${shopifyRelatedIds.length} links`);
    await setMetafield("bound-products", currentProductShopifyId, shopifyRelatedIds, accessToken, shopDomain);

    // --- Related products (bc_product_related) ---
    const relatedRows = await externalDB.bc_product_related.findMany({
      where: { product_id: product.product_id },
    });

    const shopifyRecommendedIds: string[] = [];
    for (const row of relatedRows) {
      const relatedProduct = await externalDB.bc_product.findUnique({
        where: { product_id: row.related_id },
        select: { model: true },
      });
      if (relatedProduct) {
        const shopifyId = await findShopifyProductBySku(relatedProduct.model, accessToken, shopDomain);
        if (shopifyId) {
          shopifyRecommendedIds.push(shopifyId);
        }
      }
    }

    console.log(`[${product.product_id}] Setting recommended_products: ${shopifyRecommendedIds.length} links`);
    await setMetafield("recommended_products", currentProductShopifyId, shopifyRecommendedIds, accessToken, shopDomain);
  } catch (error: any) {
    if (error.message?.startsWith("OWNER_NOT_FOUND:")) {
      console.warn(`[${product.product_id}] Product ${currentProductShopifyId} not found in Shopify`);
    }
    throw error;
  }
};
