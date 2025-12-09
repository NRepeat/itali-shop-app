import {
  ProductVariantsCreateMutationVariables,
  ProductVariantsCreateMutation,
} from "@/types";
import { prisma } from "@shared/lib/prisma/prisma.server";
import { client } from "@shared/lib/shopify/client/client";

const PRODUCT_VARIANTS_BULK_CREATE = `
  #graphql
  mutation ProductVariantsCreateA($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkCreate(productId: $productId, variants: $variants) {
      productVariants {
        id
        title
        selectedOptions {
          name
          value
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const productVariantsBulkCreate = async (
  domain: string,
  variables: ProductVariantsCreateMutationVariables,
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
      ProductVariantsCreateMutation,
      ProductVariantsCreateMutationVariables
    >({
      query: PRODUCT_VARIANTS_BULK_CREATE,
      variables: variables,
      accessToken: accessToken,
      shopDomain: domain,
    });

    if (res.productVariantsBulkCreate?.userErrors) {
      console.error(
        "Vriants bulk creation failed:",
        res.productVariantsBulkCreate.userErrors
          .map((error) => error.message)
          .join(", "),
      );
      throw new Error("Media creation failed");
    }
    return res.productVariantsBulkCreate;
  } catch (error) {
    console.error("Product variants bulk creation failed:", error);
    throw new Error("Product variants bulk creation failed");
  }
};
