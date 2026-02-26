import { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { MetaobjectStatus } from "app/types";

const query = `
  #graphql
  mutation upsertMetaobject($handle: MetaobjectHandleInput!, $metaobject: MetaobjectUpsertInput!) {
    metaobjectUpsert(handle: $handle, metaobject: $metaobject) {
      metaobject {
        handle
        id
        type
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

export interface UpsertMetaobjectInput {
  type: string;
  handle: string;
  fields: { key: string; value: string }[];
}

export const upsertMetaobject = async (
  input: UpsertMetaobjectInput,
  admin: AdminApiContext,
) => {
  try {
    const res = await admin.graphql(query, {
      variables: {
        handle: { handle: input.handle, type: input.type },
        metaobject: {
          capabilities: {
            publishable: { status: "ACTIVE" as MetaobjectStatus },
          },
          fields: input.fields,
        },
      },
    });

    if (!res.ok) {
      throw new Error(
        `Failed to upsert metaobject: ${res.status} ${res.statusText}`,
      );
    }

    const data = await res.json();

    if (
      data.data?.metaobjectUpsert?.userErrors &&
      data.data.metaobjectUpsert.userErrors.length > 0
    ) {
      throw new Error(
        data.data.metaobjectUpsert.userErrors
          .map((e: { message: string }) => e.message)
          .join(", "),
      );
    }

    return data.data?.metaobjectUpsert?.metaobject ?? null;
  } catch (error) {
    console.error(`[upsertMetaobject] Error for handle "${input.handle}":`, error);
    return null;
  }
};
