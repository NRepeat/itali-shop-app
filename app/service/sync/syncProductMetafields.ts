import {
  CreateMetaobjectDefinitionMutationVariables,
  InputMaybe,
  MetafieldDefinitionInput,
  MetafieldOwnerType,
  MetaobjectStorefrontAccess,
  MetafieldCustomerAccountAccessInput,
  MetafieldStorefrontAccessInput,
  TranslatableResourceQuery,
  TranslationInput,
  TranslationsRegisterMutation,
} from "app/types"; // Ensure all types are correctly imported
import { getOcFilterMap, getocFilterOptionValues } from "../maps/metafields";
import { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { prisma } from "app/shared/lib/prisma/prisma.server";

import { dataArray } from "app/data/categoriesIds";
import { createMetaobjectDefinition } from "../shopify/metaobjects/createMetaobjectDefinition";
import { createMetafieldDefinition } from "../shopify/metafields/createProductMetafield";
import { upsertMetaobject } from "../shopify/metaobjects/upsertMetaobject";
import { getMetaobjectDefinitionByType } from "../shopify/metaobjects/getMetaobjectDefinitionByType";

const GET_TRANSLATABLE_RESOURCE_QUERY = `
  #graphql
  query translatableResource($id: ID!) {
    translatableResource(resourceId: $id) {
      translatableContent {
        key
        digest
        value
      }
    }
  }
`;

const TRANSLATIONS_REGISTER_MUTATION = `
  mutation translationsRegister($resourceId: ID!, $translations: [TranslationInput!]!) {
    translationsRegister(resourceId: $resourceId, translations: $translations) {
      translations {
        locale
        key
      }
      userErrors {
        field
        message
      }
    }
  }
`;

interface LocalMetaobjectDefinition {
  metaobjecDefinitionId: string;
  name: string;
  type: string;
}
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
            displayNameKey: "label",
            fieldDefinitions: [
              {
                key: "slug",
                name: "Slug",
                required: true,
                type: "single_line_text_field",
              },
              {
                key: "label",
                name: "Label",
                required: true,
                type: "single_line_text_field",
              },
            ],
          },
        };

      if (localDefinition) {
        shopifyDefinitionResult = {
          id: localDefinition.metaobjecDefinitionId,
          name: localDefinition.name,
          type: localDefinition.type,
        };
        console.log(`[Definition Exists] Using local definition for type: ${type}`);
      } else {
        shopifyDefinitionResult = await createMetaobjectDefinition(
          metaobjectDefinitionPayload,
          admin,
        );

        // If creation failed (e.g. "Type has already been taken"), fetch the existing definition
        if (!shopifyDefinitionResult) {
          console.log(
            `[Definition] Create failed for type "${type}", fetching existing from Shopify...`,
          );
          shopifyDefinitionResult = await getMetaobjectDefinitionByType(type, admin);
        }

        if (!shopifyDefinitionResult) {
          console.error(
            `Failed to get definition for type: ${type}. Skipping metaobjects.`,
          );
          continue;
        }

        console.log(
          `[Definition] Using definition: ${shopifyDefinitionResult.name}`,
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

      // Build handle → Russian label map for translation step
      const handleToRusLabel = new Map<string, string>();
      Array.from(filterOptions[0]).forEach((f: string, i: number) => {
        const safeHandle = f.replace(/,/g, "-").toLowerCase();
        const rusLabel = filterOptions[2]?.[i];
        if (rusLabel) {
          handleToRusLabel.set(safeHandle, rusLabel);
        }
      });

      const metaobjectsReq = Array.from(filterOptions[0]).map(
        (f: string, i: number) => {
          const safeHandle = f.replace(/,/g, "-").toLowerCase();
          const label = filterOptions[1][i]
            ? filterOptions[1][i]
                .replace("-", ",")
                .toLowerCase()
                .replace(/(^.)/, (match) => match.toUpperCase())
            : "";
          return upsertMetaobject(
            {
              type: shopifyDefinitionResult!.type,
              handle: safeHandle,
              fields: [
                { key: "slug", value: f },
                { key: "label", value: label },
              ],
            },
            admin,
          );
        },
      );

      const metaobjects = await Promise.all(metaobjectsReq);

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

      // 5. REGISTER RUSSIAN TRANSLATIONS for each created metaobject
      if (uniqueMetaobjects.length > 0) {
        const translateRequests = uniqueMetaobjects.map(async (m) => {
          const rusLabel = handleToRusLabel.get(m!.handle);
          if (!rusLabel) return;

          const digestRes = await admin.graphql(GET_TRANSLATABLE_RESOURCE_QUERY, {
            variables: { id: m!.id },
          });
          if (!digestRes.ok) {
            console.error(`[Translation] Failed to fetch digests for metaobject "${m!.handle}": ${digestRes.statusText}`);
            return;
          }

          const digestData: { data?: TranslatableResourceQuery } = await digestRes.json();
          const digests = digestData.data?.translatableResource?.translatableContent || [];
          const labelDigest = digests.find((d) => d.key === "label");
          if (!labelDigest) return;

          const translations: TranslationInput[] = [
            {
              locale: "ru",
              key: "label",
              value: rusLabel,
              translatableContentDigest: labelDigest.digest!,
            },
          ];

          const registerRes = await admin.graphql(TRANSLATIONS_REGISTER_MUTATION, {
            variables: { resourceId: m!.id, translations },
          });
          if (!registerRes.ok) {
            console.error(`[Translation] Failed to register translation for "${m!.handle}": ${registerRes.statusText}`);
            return;
          }

          const registerData: { data?: TranslationsRegisterMutation } = await registerRes.json();
          if (registerData.data?.translationsRegister?.userErrors?.length) {
            console.error(
              `[Translation] Error for "${m!.handle}":`,
              registerData.data.translationsRegister.userErrors,
            );
          } else {
            console.log(`[Translation] Registered ru label for metaobject "${m!.handle}"`);
          }
        });

        await Promise.all(translateRequests);
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
