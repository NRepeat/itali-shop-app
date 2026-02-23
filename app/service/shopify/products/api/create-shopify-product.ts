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

const CAPABILITY_VIOLATION_REGEX =
  /Metafield Namespace: (\S+),\s*Metafield Key: (\S+)/;

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
      variables,
      accessToken,
      shopDomain: domain,
    });
    console.log("res", JSON.stringify(res));

    const userErrors = res.productSet?.userErrors ?? [];
    if (userErrors.length > 0) {
      console.error(`[productSet] userErrors:`, JSON.stringify(userErrors));

      // Retry logic: if ALL errors are CAPABILITY_VIOLATION on option-linked
      // metafields, strip the offending metafields and retry once.
      const allCapabilityViolations = userErrors.every(
        (e) =>
          e.code === "CAPABILITY_VIOLATION" &&
          CAPABILITY_VIOLATION_REGEX.test(e.message ?? ""),
      );

      if (allCapabilityViolations) {
        const offendingPairs = userErrors.map((e) => {
          const match = CAPABILITY_VIOLATION_REGEX.exec(e.message ?? "")!;
          return { namespace: match[1], key: match[2] };
        });
        const offendingSet = new Set(
          offendingPairs.map((p) => `${p.namespace}.${p.key}`),
        );

        console.log(
          `[productSet] CAPABILITY_VIOLATION on option-linked metafields, stripping and retrying: ${JSON.stringify(offendingPairs)}`,
        );

        const cleanedVariables: CreateProductAsynchronousMutationVariables = {
          ...variables,
          productSet: {
            ...variables.productSet,
            metafields: (variables.productSet.metafields ?? []).filter(
              (mf) => !offendingSet.has(`${mf.namespace}.${mf.key}`),
            ),
          },
        };

        const retryRes = await client.request<
          CreateProductAsynchronousMutation,
          CreateProductAsynchronousMutationVariables
        >({
          query: CREATE_PRODUCTS_QUERY,
          variables: cleanedVariables,
          accessToken,
          shopDomain: domain,
        });
        console.log("[productSet] retry res", JSON.stringify(retryRes));

        const retryErrors = retryRes.productSet?.userErrors ?? [];
        if (retryErrors.length === 0) {
          return retryRes.productSet?.product;
        }

        console.error(
          `[productSet] retry userErrors:`,
          JSON.stringify(retryErrors),
        );
        return null;
      }

      return null;
    }
    return res.productSet?.product;
  } catch (error) {
    console.error(error);
    throw new Error(`Failed to update Shopify product: ${error}`);
  }
};
