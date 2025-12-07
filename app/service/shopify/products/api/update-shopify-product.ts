import {
  UpdateProductWithNewMediaMutationVariables,
  UpdateProductWithNewMediaMutation,
} from "@/types";
import { prisma } from "@shared/lib/prisma/prisma.server";
import { client } from "@shared/lib/shopify/client/client";

const UPDATE_PRODUCTS_QUERY = `
  #graphql
  mutation UpdateProductWithNewMedia($product: ProductUpdateInput!, $media: [CreateMediaInput!]) {
    productUpdate(product: $product, media: $media) {
      product {
        id
        media(first: 10) {
          nodes {
            alt
            mediaContentType
            preview {
              status
            }
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
  `;
export const updateShopifyProduct = async (
  domain: string,
  variables: UpdateProductWithNewMediaMutationVariables,
) => {
  try {
    const session = await prisma.session.findFirst({
      where: { shop: domain },
    });

    if (!session?.accessToken) {
      throw new Error("Session or Access Token not found");
    }
    const accessToken = session.accessToken;
    const res = await client.request<
      UpdateProductWithNewMediaMutation,
      UpdateProductWithNewMediaMutationVariables
    >({
      query: UPDATE_PRODUCTS_QUERY,
      variables: variables,
      accessToken: accessToken,
      shopDomain: domain,
    });

    if (
      res.productUpdate?.userErrors &&
      res.productUpdate?.userErrors.length > 0
    ) {
      throw new Error(
        `Failed to update Shopify product: ${JSON.stringify(
          res.productUpdate.userErrors,
          null,
          2,
        )}`,
      );
    }

    return res.productUpdate;
  } catch (error) {
    console.error(error);
    throw new Error(`Failed to update Shopify product: ${error}`);
  }
};
