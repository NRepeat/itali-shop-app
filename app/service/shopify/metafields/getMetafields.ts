import { MetafieldDefinitionsQueryVariables } from "@/types";
import { prisma } from "@shared/lib/prisma/prisma.server";
import { AdminApiContext } from "@shopify/shopify-app-react-router/server";

export const getMetafields = async (
  admin: AdminApiContext,
  variables: MetafieldDefinitionsQueryVariables,
) => {
  console.log(variables, "variables");
  try {
    const data = await admin.graphql(
      `#graphql
  query MetafieldDefinitions($ownerType: MetafieldOwnerType!, $first: Int, $query: String,$key:String) {
    metafieldDefinitions(ownerType: $ownerType, first: $first,query:$query,key:$key ) {
      nodes {
        name
        id
        namespace
        key
        type {
          name
        }
      }
    }
  }`,
      { variables },
    );
    return data.data.metafieldDefinitions.nodes || [];
  } catch (e) {
    console.log(e);
    throw new Error("Meta not found");
  }
};
