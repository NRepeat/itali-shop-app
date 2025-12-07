import {
  ProductVariantsCreateMutationVariables,
  ProductVariantsCreateMutation,
} from "@/types";
import { prisma } from "@shared/lib/prisma/prisma.server";
import { client } from "@shared/lib/shopify/client/client";

const CREATE_PRODUCT_VARIANTS_MUTATION = `
  #graphql
  mutation ProductVariantsCreate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkCreate(productId: $productId, variants: $variants) {
      productVariants {
        id
        title
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const createShopifyProductVariants = async (
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
      query: CREATE_PRODUCT_VARIANTS_MUTATION,
      variables: variables,
      accessToken: accessToken,
      shopDomain: domain,
    });

    if (
      res.productVariantsBulkCreate?.userErrors &&
      res.productVariantsBulkCreate.userErrors.length > 0
    ) {
      throw new Error(
        `Failed to create Shopify product variants: ${res.productVariantsBulkCreate.userErrors[0].message}`,
      );
    }
    if (!res.productVariantsBulkCreate?.productVariants) {
      throw new Error(`Failed to create Shopify product variants`);
    }
    return res.productVariantsBulkCreate.productVariants;
  } catch (error) {
    throw new Error(`Failed to create Shopify product variants: ${error}`);
  }
};
