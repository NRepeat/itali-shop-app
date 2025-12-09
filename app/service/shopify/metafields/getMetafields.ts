import { MetafieldDefinitionsQueryVariables } from "@/types";
import { AdminApiContext } from "@shopify/shopify-app-react-router/server";

const query = `
  #graphql
  query MetafieldDefinitions($ownerType: MetafieldOwnerType!, $first: Int, $query:String,$key:String) {
    metafieldDefinitions(ownerType: $ownerType, first: $first, query:$query ,key:$key) {
      nodes {
        id
        name
        namespace
        key
        type {
          name
        }
      }
    }
  }
  `;

export const getMetafields = async (
  admin: AdminApiContext,
  variables: MetafieldDefinitionsQueryVariables,
) => {
  try {
    const res = await admin.graphql(query, {
      variables: variables,
    });
    if (!res.ok) {
      throw new Error(
        `Failed to create metafield definition: ${res.status} ${res.statusText}`,
      );
    }
    const data = await res.json();

    // if (
    //   data.data?.metafieldDefinitions?.userErrors &&
    //   data.data.metafieldDefinitions?.userErrors?.length > 0
    // ) {
    //   throw new Error(
    //     data.data.metafieldDefinitions.userErrors
    //       .map((error) => error.message)
    //       .join(", "),
    //   );
    // }

    return data.data || null;
  } catch (e) {
    throw new Error("Meta not found");
  }
};
