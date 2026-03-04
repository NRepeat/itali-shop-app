import { client } from "@shared/lib/shopify/client/client";

const GET_PRODUCT_TAGS_QUERY = `
  query getProductTags($id: ID!) {
    product(id: $id) {
      tags
    }
  }
`;

export const fetchShopifyProductTags = async (
  productId: string,
  accessToken: string,
  shopDomain: string,
): Promise<string[]> => {
  try {
    const response = await client.request<{ product: { tags: string[] } | null }>({
      query: GET_PRODUCT_TAGS_QUERY,
      variables: { id: productId },
      accessToken,
      shopDomain,
    });
    return response.product?.tags ?? [];
  } catch (error) {
    console.error(`Error fetching tags for product ${productId}:`, error);
    return [];
  }
};

const FIND_PRODUCT_BY_SKU_QUERY = `
  query findProductBySku($query: String!) {
    products(first: 1, query: $query) {
      nodes {
        id
        title
        handle
      }
    }
  }
`;

/**
 * Find a product in Shopify by SKU (model)
 * @param sku - Product SKU/model to search for
 * @param accessToken - Shopify access token
 * @param shopDomain - Shop domain
 * @returns Product ID if found, null otherwise
 */
export const findShopifyProductBySku = async (
  sku: string,
  accessToken: string,
  shopDomain: string,
): Promise<string | null> => {
  try {
    const response = await client.request<{
      products: {
        nodes: Array<{ id: string; title: string; handle: string }>;
      };
    }>({
      query: FIND_PRODUCT_BY_SKU_QUERY,
      variables: { query: `sku:${sku}` },
      accessToken,
      shopDomain,
    });

    const product = response.products?.nodes?.[0];
    return product?.id || null;
  } catch (error) {
    console.error(`Error finding product by SKU ${sku}:`, error);
    return null;
  }
};
