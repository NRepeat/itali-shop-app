import { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { CreateMetaobjectDefinitionMutationVariables } from "app/types";

const query = `
  #graphql
  mutation CreateMetaobjectDefinition($definition: MetaobjectDefinitionCreateInput!) {
    metaobjectDefinitionCreate(definition: $definition) {
      metaobjectDefinition {
        id
        name
        type
        fieldDefinitions {
          name
          key
        }
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

export const createMetaobjectDefinition = async (
  definition: CreateMetaobjectDefinitionMutationVariables,
  admin: AdminApiContext,
) => {
  try {
    const res = await admin.graphql(query, {
      variables: { definition: definition.definition },
    });
    if (!res.ok) {
      throw new Error(
        `Failed to create metafield definition: ${res.status} ${res.statusText}`,
      );
    }
    const data = await res.json();

    if (
      data.data?.metaobjectDefinitionCreate?.userErrors &&
      data.data.metaobjectDefinitionCreate?.userErrors?.length > 0
    ) {
      throw new Error(
        data.data.metaobjectDefinitionCreate.userErrors
          .map((error: { message: string }) => error.message)
          .join(", "),
      );
    }

    return data.data?.metaobjectDefinitionCreate?.metaobjectDefinition || null;
  } catch (error) {
    console.error(error);
    return null;
  }
};
