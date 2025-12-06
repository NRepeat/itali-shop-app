import {
  CreateCollectionMutation,
  CreateCollectionMutationVariables,
} from "@/types";
import { AdminApiContext } from "@shopify/shopify-app-react-router/server";

const query = `
  #graphql
  mutation CreateCollection($input: CollectionInput!) {
    collectionCreate(input: $input) {
      collection {
        id
        title
        handle
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const createCreateCollection = async (
  definition: CreateCollectionMutationVariables,
  admin: AdminApiContext,
): Promise<CreateCollectionMutation | null> => {
  try {
    const res = await admin.graphql(query, {
      variables: { input: definition.input },
    });
    if (!res.ok) {
      throw new Error(
        `Failed to create metafield definition: ${res.status} ${res.statusText}`,
      );
    }
    const data = await res.json();

    if (
      data.data?.collectionCreate?.userErrors &&
      data.data.collectionCreate?.userErrors?.length > 0
    ) {
      throw new Error(
        data.data.collectionCreate.userErrors
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
