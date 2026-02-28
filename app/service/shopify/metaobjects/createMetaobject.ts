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
    const { data } = await (admin.graphql as any)(query, {
      variables: { metaobject: definition.metaobject },
    });

    if (data?.metaobjectCreate?.userErrors?.length > 0) {
      throw new Error(
        data.metaobjectCreate.userErrors
          .map((error: { message: string }) => error.message)
          .join(", "),
      );
    }

    return data?.metaobjectCreate?.metaobject;
  } catch (error) {
    console.error(error);
    return null;
  }
};
