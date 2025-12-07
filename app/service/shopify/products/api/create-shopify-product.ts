import {
  ProductCreateMutationMutationVariables,
  ProductCreateMutationMutation,
} from "@/types";
import { prisma } from "@shared/lib/prisma/prisma.server";
import { client } from "@shared/lib/shopify/client/client";

const CREATE_PRODUCTS_QUERY = `
  #graphql
  mutation ProductCreateMutation(
    $product: ProductCreateInput!,
    $media: [CreateMediaInput!]
  ) {
    productCreate(product: $product, media: $media) {
      product {
        id
        title
        handle
        variants(first:1){
          edges{
            node{
            id
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
export const createShopifyProduct = async (
  domain: string,
  variables: ProductCreateMutationMutationVariables,
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
      ProductCreateMutationMutation,
      ProductCreateMutationMutationVariables
    >({
      query: CREATE_PRODUCTS_QUERY,
      variables: variables,
      accessToken: accessToken,
      shopDomain: domain,
    });
    if (
      res.productCreate?.userErrors &&
      res.productCreate.userErrors.length > 0
    ) {
      throw new Error(
        `Failed to create Shopify product: ${res.productCreate.userErrors[0].message}`,
      );
    }
    if (!res.productCreate?.product) {
      throw new Error(`Failed to create Shopify product`);
    }
    console.log(
      "res.productCreate.product",
      res.productCreate.product.variants.edges[0],
    );
    return res.productCreate.product;
  } catch (error) {
    throw new Error(`Failed to update Shopify product: ${error}`);
  }
};
