import { getShopifyAdminCredentials } from "@shared/lib/shopify/admin-api/utils";
import { client } from "@shared/lib/shopify/client/client";

const CHECK_PRODUCT_EXISTS_QUERY = `
  query checkProductExists($id: ID!) {
    node(id: $id) {
      id
      ... on Product {
        id
      }
    }
  }
`;

/**
 * Checks if a product exists in Shopify by its GID using stored admin credentials.
 * @param shopifyProductId - The Shopify Product GID (e.g., "gid://shopify/Product/12345").
 * @returns true if the product exists, false otherwise.
 */
export const checkProductExistsById = async (
  shopifyProductId: string,
): Promise<boolean> => {
  try {
    const { accessToken, shopDomain } = await getShopifyAdminCredentials();
    console.log("🚀 ~ checkProductExistsById ~ shopDomain:", shopDomain);
    console.log("🚀 ~ checkProductExistsById ~ accessToken:", accessToken);

    const response = await client.request<
      {
        node: { id: string; __typename: string } | null;
      },
      { id: string }
    >({
      query: CHECK_PRODUCT_EXISTS_QUERY,
      variables: { id: shopifyProductId },
      accessToken,
      shopDomain,
    });
    console.log("🚀 ~ checkProductExistsById ~ response:", response);

    // If node is not null and has an ID, the product exists.
    // Also check if it's actually a Product type, not just any node.
    if (response.node) {
      return response.node !== null;
    }
  } catch (error) {
    console.error(
      `Error checking product existence for ID ${shopifyProductId}:`,
      error,
    );
    return false;
  }
};
