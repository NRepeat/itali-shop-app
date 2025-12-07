import {
  CreateProductAsynchronousMutation,
  CreateProductAsynchronousMutationVariables,
} from "@/types";
import { prisma } from "@shared/lib/prisma/prisma.server";
import { client } from "@shared/lib/shopify/client/client";

const CREATE_PRODUCTS_QUERY = `
  #graphql
  mutation createProductAsynchronous($productSet: ProductSetInput!, $synchronous: Boolean!) {
    productSet(synchronous: $synchronous, input: $productSet) {
      product {
        id
      }
      productSetOperation {
        id
        status
        userErrors {
          code
          field
          message
        }
      }
      userErrors {
        code
        field
        message
      }
    }
  }
`;
export const createProductAsynchronous = async (
  domain: string,
  variables: CreateProductAsynchronousMutationVariables,
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
      CreateProductAsynchronousMutation,
      CreateProductAsynchronousMutationVariables
    >({
      query: CREATE_PRODUCTS_QUERY,
      variables: variables,
      accessToken: accessToken,
      shopDomain: domain,
    });
    console.log(res);

    return res.productSet.product;
  } catch (error) {
    throw new Error(`Failed to update Shopify product: ${error}`);
  }
};
