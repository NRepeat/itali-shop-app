import { externalDB, prisma } from "@shared/lib/prisma/prisma.server";
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

/** Resolve external product_id → Shopify GID. ProductMap first, SKU fallback. */
async function resolveShopifyId(
  localProductId: number,
  accessToken: string,
  shopDomain: string,
): Promise<string | null> {
  const map = await prisma.productMap.findUnique({ where: { localProductId } });
  if (map) return map.shopifyProductId;

  // Fallback: look up by SKU and populate ProductMap for future runs.
  // Use raw query to avoid Prisma P2020 on rows with date_available='0000-00-00'.
  const rows = await externalDB.$queryRawUnsafe<Array<{ model: string }>>(
    `SELECT model FROM bc_product WHERE product_id = ${localProductId} LIMIT 1`,
  );
  const model = rows[0]?.model?.trim();
  if (!model) return null;

  const shopifyId = await findShopifyProductBySku(model, accessToken, shopDomain);
  if (shopifyId) {
    try {
      await prisma.productMap.upsert({
        where: { localProductId },
        update: { shopifyProductId: shopifyId },
        create: { localProductId, shopifyProductId: shopifyId },
      });
    } catch (e: any) {
      // P2002: shopifyProductId already mapped to another localProductId — safe to ignore
      if (e?.code !== "P2002") throw e;
    }
  }
  return shopifyId;
}

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

    // Some referenced products may not exist in Shopify yet — strip them and retry once
    const missingGids = userErrors
      .map((e: any) => {
        const m = /Value references non-existent resource (gid:\/\/\S+)\./.exec(e.message ?? "");
        return m ? m[1] : null;
      })
      .filter(Boolean) as string[];

    if (missingGids.length > 0) {
      const filtered = value.filter((v) => !missingGids.includes(v));
      console.warn(`[setMetafield] Skipping ${missingGids.length} missing product GID(s) for ${key} on ${ownerId}`);
      if (filtered.length === 0) return;
      const retryVars = {
        metafields: [{ key, namespace: "custom", ownerId, type: "list.product_reference", value: JSON.stringify(filtered) }],
      };
      const retryRes: any = await client.request({ query: METAFIELDS_SET_MUTATION, variables: retryVars, accessToken, shopDomain });
      const retryErrors = retryRes?.metafieldsSet?.userErrors ?? [];
      if (retryErrors.length > 0) {
        throw new Error(retryErrors.map((e: any) => e.message).join(", "));
      }
      return;
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
      const shopifyId = await resolveShopifyId(article.product_id, accessToken, shopDomain);
      if (shopifyId && shopifyId !== currentProductShopifyId) {
        shopifyRelatedIds.push(shopifyId);
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
      const shopifyId = await resolveShopifyId(row.related_id, accessToken, shopDomain);
      if (shopifyId) {
        shopifyRecommendedIds.push(shopifyId);
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
