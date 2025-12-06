import { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import {
  CreateMetafieldDefinitionMutation,
  CreateMetafieldDefinitionMutationVariables,
} from "app/types";

const query = `
  #graphql
  mutation CreateMetafieldDefinition($definition: MetafieldDefinitionInput!) {
    metafieldDefinitionCreate(definition: $definition) {
      createdDefinition {
        id
        name
        key
        namespace
        ownerType
        type{
          name
          category
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

export const createMetafieldDefinition = async (
  definition: CreateMetafieldDefinitionMutationVariables,
  admin: AdminApiContext,
): Promise<CreateMetafieldDefinitionMutation | null> => {
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
      data.data?.metafieldDefinitionCreate?.userErrors &&
      data.data.metafieldDefinitionCreate?.userErrors?.length > 0
    ) {
      throw new Error(
        data.data.metafieldDefinitionCreate.userErrors
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
