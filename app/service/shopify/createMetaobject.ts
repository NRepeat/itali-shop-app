import { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { CreateMetaobjectMutationVariables } from "app/types";

const query = `
  #graphql
  mutation CreateMetaobject($metaobject: MetaobjectCreateInput!) {
    metaobjectCreate(metaobject: $metaobject) {
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

export const createMetaobject = async (
  definition: CreateMetaobjectMutationVariables,
  admin: AdminApiContext,
) => {
  try {
    const res = await admin.graphql(query, {
      variables: { metaobject: definition.metaobject },
    });
    if (!res.ok) {
      throw new Error(
        `Failed to create metafield definition: ${res.status} ${res.statusText}`,
      );
    }
    const data = await res.json();

    if (
      data.data?.metaobjectCreate?.userErrors &&
      data.data.metaobjectCreate?.userErrors?.length > 0
    ) {
      throw new Error(
        data.data.metaobjectCreate.userErrors
          .map((error: { message: string }) => error.message)
          .join(", "),
      );
    }

    return data.data?.metaobjectCreate?.metaobject || null;
  } catch (error) {
    console.error(error);
    return null;
  }
};
