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
    console.log(res);

    const data = res;

    return data.data || null;
  } catch (e) {
    console.log(e);
    throw new Error("Meta not found");
  }
};
