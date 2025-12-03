import { MetafieldDefinitionInput, MetafieldOwnerType } from "app/types";
import { getOcFilterMap } from "../maps/metafields";
import { createMetafieldDefinition } from "../shopify/createProductMetafield";
import { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { metafieldDefinitionPin } from "../shopify/metafieldDefinitionPin";
import { prisma } from "app/shared/lib/prisma/prisma.server";

export const syncProductMetafields = async (admin: AdminApiContext) => {
  try {
    const metafields = await getOcFilterMap();
    if (!metafields || !metafields.size) return;
    const definitions: MetafieldDefinitionInput[] = [];
    for (const metafield of metafields) {
      definitions.push({
        key: metafield[0],
        name: metafield[1],
        namespace: "custom",
        ownerType: "PRODUCT" as MetafieldOwnerType,
        type: "list.single_line_text_field",
      });
    }
    console.log(definitions);
    const requests = definitions.map((definition) => {
      return createMetafieldDefinition({ definition }, admin);
    });
    const results = await Promise.all(requests);
    for (const result of results) {
      console.log(result?.metafieldDefinitionCreate?.createdDefinition?.id);
      const id = result?.metafieldDefinitionCreate?.createdDefinition?.id;
      if (
        result?.metafieldDefinitionCreate?.userErrors &&
        result?.metafieldDefinitionCreate?.userErrors.length > 0
      ) {
        console.error(result?.metafieldDefinitionCreate?.userErrors);
        continue;
      }
      await prisma.metafieldDefinition.upsert({
        where: { id },
        update: {
          key: result?.metafieldDefinitionCreate?.createdDefinition?.key,
          namespace:
            result?.metafieldDefinitionCreate?.createdDefinition?.namespace,
          ownerType:
            result?.metafieldDefinitionCreate?.createdDefinition?.ownerType,
          type: result?.metafieldDefinitionCreate?.createdDefinition?.type
            .category,
        },
        create: {
          metafieldId: id || "",
          key: result?.metafieldDefinitionCreate?.createdDefinition?.key || "",
          namespace:
            result?.metafieldDefinitionCreate?.createdDefinition?.namespace,
          ownerType:
            result?.metafieldDefinitionCreate?.createdDefinition?.ownerType ||
            "",
          type:
            result?.metafieldDefinitionCreate?.createdDefinition?.type
              .category || "",
        },
      });
      await metafieldDefinitionPin({ definitionId: id! }, admin);
    }
  } catch (error) {
    console.error(error);
  }
};
