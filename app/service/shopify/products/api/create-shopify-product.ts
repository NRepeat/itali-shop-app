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

    let currentVariables = variables;

    for (let attempt = 0; attempt <= 1; attempt++) {
      const res = await client.request<
        CreateProductAsynchronousMutation,
        CreateProductAsynchronousMutationVariables
      >({
        query: CREATE_PRODUCTS_QUERY,
        variables: currentVariables,
        accessToken,
        shopDomain: domain,
      });
      console.log("res", JSON.stringify(res));

      const userErrors = res.productSet?.userErrors ?? [];

      if (userErrors.length === 0) {
        return res.productSet?.product;
      }

      // On first attempt, check for CAPABILITY_VIOLATION (metafield connected to option)
      if (attempt === 0) {
        const violations = userErrors.filter((e: any) => e.code === "CAPABILITY_VIOLATION");
        if (violations.length > 0) {
          const offendingKeys = new Set<string>();
          for (const err of violations) {
            const match = (err.message as string).match(/Metafield Key:\s*([^\s,]+)/);
            if (match) offendingKeys.add(match[1]);
          }
          console.warn(
            `[productSet] CAPABILITY_VIOLATION — removing option-linked metafields [${[...offendingKeys].join(", ")}] and retrying`,
          );
          currentVariables = {
            ...currentVariables,
            productSet: {
              ...currentVariables.productSet,
              metafields: (currentVariables.productSet.metafields ?? []).filter(
                (mf: any) => !offendingKeys.has(mf.key),
              ),
            },
          };
          continue;
        }
      }

      console.error(`[productSet] userErrors:`, JSON.stringify(userErrors));
      return null;
    }

    return null;
  } catch (error) {
    console.error(error);
    throw new Error(`Failed to update Shopify product: ${error}`);
  }
};
