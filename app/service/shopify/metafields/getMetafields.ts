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
    // For key-based lookups, try both "rozmir" and "custom.rozmir" since Shopify
    // prefixes metaobject definition types with "custom." on creation.
    const localData = await prisma.metaobjectDefinition.findMany({
      where: variables.key
        ? {
            OR: [
              { type: variables.key },
              { type: `custom.${variables.key}` },
            ],
          }
        : {
            name: { equals: variables.query, mode: "insensitive" },
          },
    });

    if (localData.length > 0) {
      return localData;
    }

    // Local DB miss — fall back to Shopify metafieldDefinitions and backfill.
    // We derive the metaobject definition type as `${namespace}.${key}` (e.g. "custom.rozmir")
    // so the returned rows match the format callers expect (.type = "custom.rozmir").
    const res = await (admin as any).graphql(METAFIELD_DEFINITIONS_QUERY, {
      variables,
    });
    const nodes: Array<{
      id: string;
      name: string;
      namespace: string;
      key: string;
      type: { name: string };
    }> = res?.data?.metafieldDefinitions?.nodes ?? [];

    if (nodes.length === 0) {
      return [];
    }

    const upserted = await Promise.all(
      nodes.map((node) => {
        // Reconstruct the metaobject definition type from namespace + key
        const metaobjectType = `${node.namespace}.${node.key}`;
        return prisma.metaobjectDefinition.upsert({
          where: { name: node.name },
          update: { metaobjecDefinitionId: node.id, type: metaobjectType },
          create: { metaobjecDefinitionId: node.id, name: node.name, type: metaobjectType },
        });
      }),
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
