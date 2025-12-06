import { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import {
  MetafieldDefinitionPinMutation,
  MetafieldDefinitionPinMutationVariables,
} from "app/types/admin.generated";

const query = `
  #graphql
  mutation metafieldDefinitionPin($definitionId: ID!) {
    metafieldDefinitionPin(definitionId: $definitionId) {
      pinnedDefinition {
        name
        key
        namespace
        pinnedPosition
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const metafieldDefinitionPin = async (
  definition: MetafieldDefinitionPinMutationVariables,
  admin: AdminApiContext,
): Promise<MetafieldDefinitionPinMutation | null> => {
  try {
    const res = await admin.graphql(query, {
      variables: { definitionId: definition.definitionId },
    });
    if (!res.ok) {
      throw new Error(
        `Failed to create metafield definition: ${res.status} ${res.statusText}`,
      );
    }
    const data = await res.json();

    if (
      data.data?.metafieldDefinitionPin?.userErrors &&
      data.data.metafieldDefinitionPin?.userErrors?.length > 0
    ) {
      throw new Error(
        data.data.metafieldDefinitionPin.userErrors
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
