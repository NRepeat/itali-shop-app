import { MetafieldDefinitionsQueryVariables } from "@/types";
import { prisma } from "@shared/lib/prisma/prisma.server";
import { AdminApiContext } from "@shopify/shopify-app-react-router/server";

const METAFIELD_DEFINITIONS_QUERY = `
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
    const localData = await prisma.metaobjectDefinition.findMany({
      where: variables.key
        ? { type: variables.key }
        : {
            name: { equals: variables.query, mode: "insensitive" },
          },
    });

    if (localData.length > 0) {
      return localData;
    }

    // Local DB miss — fall back to Shopify and backfill
    const res = await (admin as any).graphql(METAFIELD_DEFINITIONS_QUERY, {
      variables,
    });
    const nodes: Array<{ id: string; name: string; type: { name: string } }> =
      res?.data?.metafieldDefinitions?.nodes ?? [];

    if (nodes.length === 0) {
      return [];
    }

    const upserted = await Promise.all(
      nodes.map((node) =>
        prisma.metaobjectDefinition.upsert({
          where: { name: node.name },
          update: { metaobjecDefinitionId: node.id, type: node.type.name },
          create: { metaobjecDefinitionId: node.id, name: node.name, type: node.type.name },
        }),
      ),
    );

    console.log(
      `[getMetafields] Backfilled ${upserted.length} definition(s) from Shopify for query="${variables.query ?? variables.key}"`,
    );
    return upserted;
  } catch (e) {
    console.log(e);
    throw new Error("Meta not found");
  }
};
