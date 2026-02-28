import { client } from "@shared/lib/shopify/client/client";
import { MetafieldInput } from "@/types";

const METAFIELDS_SET_MUTATION = `
  mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields {
        key
        namespace
        value
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

export const setProductMetafields = async (
  productId: string,
  accessToken: string,
  shopDomain: string,
  znizka: number,
  sortOrder: number,
  filterMetafields: MetafieldInput[],
): Promise<void> => {
  const metafields = [
    {
      ownerId: productId,
      namespace: "custom",
      key: "znizka",
      type: "number_integer",
      value: znizka.toString(),
    },
    {
      ownerId: productId,
      namespace: "custom",
      key: "sort_order",
      type: "number_integer",
      value: sortOrder.toString(),
    },
    ...filterMetafields.map((mf) => ({
      ownerId: productId,
      namespace: mf.namespace as string,
      key: mf.key as string,
      type: mf.type as string,
      value: mf.value as string,
    })),
  ];

  const response: any = await client.request({
    query: METAFIELDS_SET_MUTATION,
    variables: { metafields },
    accessToken,
    shopDomain,
  });

  const userErrors = response?.metafieldsSet?.userErrors ?? [];
  if (userErrors.length > 0) {
    console.error(`[setProductMetafields] userErrors for ${productId}:`, JSON.stringify(userErrors));
  }
};
