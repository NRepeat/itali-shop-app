import { MetafieldDefinitionsQueryVariables } from "@/types";
import { prisma } from "@shared/lib/prisma/prisma.server";
import { AdminApiContext } from "@shopify/shopify-app-react-router/server";

export const getMetafields = async (
  admin: AdminApiContext,
  variables: MetafieldDefinitionsQueryVariables,
) => {
  try {
    // MetaobjectDefinition rows are seeded by syncProductMetafields when definitions
    // are created in Shopify. We query local DB only — no Shopify fallback.
    //
    // key-based lookup: try both "rozmir" and "custom.rozmir" since Shopify
    // prefixes metaobject definition types with "custom." on creation.
    const data = await prisma.metaobjectDefinition.findMany({
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

    return data || [];
  } catch (e) {
    console.log(e);
    throw new Error("Meta not found");
  }
};
