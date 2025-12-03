import { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { MetafieldOwnerType } from "app/types";

const GET_QUERY = `
  #graphql
  query GetMetafieldDefinitions($ownerType: MetafieldOwnerType!, $namespace: String) {
    metafieldDefinitions(
      first: 50,
      ownerType: $ownerType,
      namespace: $namespace
    ) {
      edges {
        node {
          id
          name
          key
          namespace
        }
      }
    }
  }
`;
export const getMetafieldDefinitions = async (
  admin: AdminApiContext,
  ownerType: MetafieldOwnerType,
  namespace: string,
) => {
  try {
    const res = await admin.graphql(GET_QUERY, {
      variables: {
        ownerType,
        namespace,
      },
    });

    if (!res.ok) {
      throw new Error(
        `Failed to fetch metafield definitions: ${res.status} ${res.statusText}`,
      );
    }

    const data = await res.json();

    return (
      data.data?.metafieldDefinitions?.edges.map((edge) => edge.node) || []
    );
  } catch (error) {
    console.error("Error fetching metafield definitions:", error);
    return [];
  }
};
