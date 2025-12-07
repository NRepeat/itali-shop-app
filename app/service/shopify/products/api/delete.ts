import {
  ProductDeleteMutationMutationVariables,
  ProductDeleteMutationMutation,
} from "@/types";
import { prisma } from "@shared/lib/prisma/prisma.server";
import { client } from "@shared/lib/shopify/client/client";

const PRODUCT_DELETE = `#graphql
  mutation productDeleteMutation ($id:ID!) {
     productDelete(input: {id: $id}) {
       deletedProductId
       userErrors {
         field
         message
       }
     }
   }
  `;

export const productDeleteMutation = async (
  domain: string,
  variables: ProductDeleteMutationMutationVariables,
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
      ProductDeleteMutationMutation,
      ProductDeleteMutationMutationVariables
    >({
      query: PRODUCT_DELETE,
      variables: variables,
      accessToken: accessToken,
      shopDomain: domain,
    });
    if (
      res.productDelete?.userErrors &&
      res.productDelete.userErrors.length > 0
    ) {
      console.error(
        "Error delete product:",
        res.productDelete.userErrors.map((error) => error.message).join(", "),
      );
      throw new Error("Error delete produc");
    }
    return res.productDelete;
  } catch (error) {
    console.error(`Error delete product ${error}`);
    throw new Error(`Error delete product: ${error}`);
  }
};
