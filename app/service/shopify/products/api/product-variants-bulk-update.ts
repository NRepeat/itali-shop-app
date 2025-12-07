import {
  ProductVariantsBulkUpdateMutationVariables,
  ProductVariantsBulkUpdateMutation,
} from "@/types";
import { prisma } from "@shared/lib/prisma/prisma.server";
import { client } from "@shared/lib/shopify/client/client";

const PRODUCT_VARIANTS_BULK_UPDATE = `
  #graphql
  mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!, $locationId: ID!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      product {
        id
      }
      productVariants {
        id
        inventoryItem{
          id
          inventoryLevel(locationId: $locationId){
            id
            quantities(names: ["available"]){
              quantity
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

export const productVariantsBulkUpdate = async (
  domain: string,
  variables: ProductVariantsBulkUpdateMutationVariables,
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
      ProductVariantsBulkUpdateMutation,
      ProductVariantsBulkUpdateMutationVariables
    >({
      query: PRODUCT_VARIANTS_BULK_UPDATE,
      variables: variables,
      accessToken: accessToken,
      shopDomain: domain,
    });

    if (
      res.productVariantsBulkUpdate?.userErrors &&
      res.productVariantsBulkUpdate.userErrors.length > 0
    ) {
      console.error(
        res.productVariantsBulkUpdate.userErrors
          .map((error) => `${error.field}: ${error.message}`)
          .join("\n"),
      );
      throw new Error("Product Variants Bulk Update Failed");
    }
    return res.productVariantsBulkUpdate;
  } catch (error) {
    console.error(error);
    throw new Error("Product Variants Bulk Update Failed");
  }
};
