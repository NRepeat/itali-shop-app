import { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { DeleteMetaobjectDefinitionMutationVariables } from "app/types/admin.generated";

const query = `
  #graphql
  mutation DeleteMetaobjectDefinition($id: ID!) {
    metaobjectDefinitionDelete(id: $id) {
      deletedId
      userErrors {
        field
        message
        code
      }
    }
  }
`;

export const metaobjectDefinitionDelete = async (
  definition: DeleteMetaobjectDefinitionMutationVariables,
  admin: AdminApiContext,
) => {
  try {
    console.log(`Attempting to delete metaobject definition: ${definition.id}`);
    const res = await admin.graphql(query, {
      variables: definition,
    });
    if (!res.ok) {
      throw new Error(
        `Failed to create metafield definition: ${res.status} ${res.statusText}`,
      );
    }
    const data = await res.json();

    if (
      data.data?.metaobjectDefinitionDelete?.userErrors &&
      data.data.metaobjectDefinitionDelete?.userErrors?.length > 0
    ) {
      throw new Error(
        data.data.metaobjectDefinitionDelete.userErrors
          .map((error) => error.message)
          .join(", "),
      );
    }

    return data.data || null;
  } catch (error) {
    console.error(error);
    return null;
  }
};
