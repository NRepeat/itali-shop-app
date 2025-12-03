import {
  CreateMetaobjectDefinitionMutationVariables,
  CreateMetaobjectMutationVariables,
  InputMaybe,
  MetafieldDefinitionInput,
  MetafieldOwnerType,
  MetaobjectStatus,
  MetaobjectStorefrontAccess,
  MetafieldCustomerAccountAccessInput,
  MetafieldStorefrontAccessInput,
} from "app/types"; // Ensure all types are correctly imported
import { getOcFilterMap, getocFilterOptionValues } from "../maps/metafields";
import { createMetafieldDefinition } from "../shopify/createProductMetafield";
import { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { prisma } from "app/shared/lib/prisma/prisma.server";
import { createMetaobjectDefinition } from "../shopify/createMetaobjectDefinition";
import { createMetaobject } from "../shopify/createMetaobject";
import { dataArray } from "app/data/categoriesIds";

// Mock interface for the local definition type structure
interface LocalMetaobjectDefinition {
  metaobjecDefinitionId: string;
  name: string;
  type: string;
}

/**
 * Synchronizes OpenCart filter maps to Shopify Metaobject Definitions,
 * creates the corresponding Metaobjects, and registers Product Metafield Definitions
 * for referencing the list of Metaobjects. Includes robust duplicate handling.
 * @param admin Admin API client context.
 */
export const syncProductMetafields = async (admin: AdminApiContext) => {
  try {
    const metafields = await getOcFilterMap();
    if (!metafields || !metafields.size) {
      console.log("No filter map data found.");
      return;
    }

    const productMetafieldDefinitions: MetafieldDefinitionInput[] = [];

    for (const metafield of Array.from(metafields)) {
      const type = metafield[0];
      const description = metafield[1].description;

      let localDefinition: LocalMetaobjectDefinition | null;
      let shopifyDefinitionResult: {
        id: string;
        name: string;
        type: string;
      } | null = null;

      localDefinition = await prisma.metaobjectDefinition.findFirst({
        where: { type: type },
      });

      if (localDefinition) {
        console.log(
          `[Definition Exists] Skipping Shopify API call for type: ${type}`,
        );
        shopifyDefinitionResult = {
          id: localDefinition.metaobjecDefinitionId,
          name: localDefinition.name,
          type: localDefinition.type,
        };
      } else {
        // 2. CREATE IN SHOPIFY: If not found locally, create the definition in Shopify.
        const metaobjectDefinitionPayload: CreateMetaobjectDefinitionMutationVariables =
          {
            definition: {
              name: description,
              type: type,
              capabilities: {
                onlineStore: { enabled: false },
                publishable: { enabled: true },
                renderable: { enabled: false },
                translatable: { enabled: true },
              },
              access: {
                storefront:
                  "PUBLIC_READ" as InputMaybe<MetaobjectStorefrontAccess>,
              },
              displayNameKey: "lable",
              fieldDefinitions: [
                {
                  key: "slug",
                  name: "Slug",
                  validations: [],
                  required: true,
                  type: "single_line_text_field",
                },
                {
                  key: "lable",
                  name: "Lable",
                  validations: [],
                  required: true,
                  type: "single_line_text_field",
                },
              ],
            },
          };

        shopifyDefinitionResult = await createMetaobjectDefinition(
          metaobjectDefinitionPayload,
          admin,
        );

        if (!shopifyDefinitionResult) {
          console.error(
            `Failed to create metafield definition for type: ${type}. Skipping metaobjects creation.`,
          );
          continue;
        }

        console.log(
          `[Definition Created] Successfully created definition: ${shopifyDefinitionResult.name}`,
        );

        localDefinition = await prisma.metaobjectDefinition.upsert({
          where: { name: shopifyDefinitionResult.name },
          update: {
            metaobjecDefinitionId: shopifyDefinitionResult.id,
            type: shopifyDefinitionResult.type,
          },
          create: {
            metaobjecDefinitionId: shopifyDefinitionResult.id,
            name: shopifyDefinitionResult.name,
            type: shopifyDefinitionResult.type,
          },
        });
      }

      const filterOptions = await getocFilterOptionValues(
        metafield[1].filter_id,
      );

      const metaobjectsReq = filterOptions?.map((f) => {
        const metaobjecCreationPayload: CreateMetaobjectMutationVariables = {
          metaobject: {
            type: shopifyDefinitionResult!.type,
            handle: f,
            capabilities: {
              publishable: { status: "ACTIVE" as MetaobjectStatus },
            },
            fields: [{ key: "type", value: f }],
          },
        };
        return createMetaobject(metaobjecCreationPayload, admin);
      });

      const metaobjects = await Promise.all(metaobjectsReq!);

      // Client-side deduplication of results
      const uniqueMetaobjects = metaobjects
        .filter(
          (m, index, self) =>
            m && index === self.findIndex((t) => t && t!.handle === m!.handle),
        )
        .filter(Boolean);

      // 4. BULK INSERT METAOBJECTS: Use skipDuplicates: true to prevent Unique constraint failed on (handle)
      if (uniqueMetaobjects.length > 0) {
        await prisma.metaobject.createMany({
          data: uniqueMetaobjects.map((m) => ({
            handle: m!.handle,
            metaobjectId: m!.id,
            type: m!.type,
          })),
          skipDuplicates: true, // Prevents Prisma crash on existing handles
        });
        console.log(
          `[Metaobjects Saved] Saved/skipped ${uniqueMetaobjects.length} metaobjects for ${type}.`,
        );
      }

      // --- Prepare Product Metafield Definition Payload ---
      productMetafieldDefinitions.push({
        key: metafield[0],
        name: metafield[1].description,
        namespace: "custom",
        ownerType: "PRODUCT" as MetafieldOwnerType,
        type: "list.metaobject_reference",
        access: {
          customerAccount:
            "NONE" as InputMaybe<MetafieldCustomerAccountAccessInput>,
          storefront:
            "PUBLIC_READ" as InputMaybe<MetafieldStorefrontAccessInput>,
        },
        validations: [
          {
            name: "metaobject_definition_id",
            value: localDefinition.metaobjecDefinitionId,
          },
        ],
        constraints: {
          key: "category",
          values: dataArray,
        },
      });
    }

    // --- Final Step: Create Product Metafield Definitions (list.metaobject_reference) ---
    const requests = productMetafieldDefinitions.map((definition) => {
      return createMetafieldDefinition({ definition }, admin);
    });

    const results = await Promise.all(requests);

    for (const result of results) {
      const shopifyId =
        result?.metafieldDefinitionCreate?.createdDefinition?.id;

      if (
        result?.metafieldDefinitionCreate?.userErrors &&
        result?.metafieldDefinitionCreate?.userErrors.length > 0
      ) {
        console.error(
          "Product Metafield Definition API Errors:",
          result?.metafieldDefinitionCreate?.userErrors,
        );
        continue;
      }

      if (shopifyId) {
        // Use upsert here too, assuming 'id' is a unique identifier
        await prisma.metafieldDefinition.upsert({
          where: { metafieldId: shopifyId }, // Assuming metafieldId is unique
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
            metafieldId: shopifyId,
            key:
              result?.metafieldDefinitionCreate?.createdDefinition?.key || "",
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
        console.log(
          `[Product Metafield] Created/Updated definition with ID: ${shopifyId}`,
        );
      }
    }
  } catch (error) {
    console.error("Critical error in syncProductMetafields:", error);
  }
};
