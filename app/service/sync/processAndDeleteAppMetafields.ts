import { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { getMetafieldDefinitions } from "../shopify/getMetafieldDefinitions";
import { MetafieldOwnerType } from "app/types";
import { deleteMetafieldDefinition } from "../shopify/deleteMetafieldDefinition";
import { prisma } from "app/shared/lib/prisma/prisma.server";

export async function processAndDeleteAppMetafields(
  admin: AdminApiContext,
  appNamespace: string = "custom",
) {
  const OWNER_TYPE = "PRODUCT" as MetafieldOwnerType;
  let deletionCount = 0;
  let failureCount = 0;

  console.log(`--- Starting Deletion Process ---`);
  console.log(
    `Searching for definitions in namespace: ${appNamespace} (Type: ${OWNER_TYPE})`,
  );

  // Шаг 1: Получаем все определения по пространству имен
  const productDefinitions = await getMetafieldDefinitions(
    admin,
    OWNER_TYPE,
    appNamespace,
  );

  if (productDefinitions.length === 0) {
    console.log("No definitions found to delete.");
    return { totalFound: 0, deleted: 0, failed: 0 };
  }

  console.log(
    `Found ${productDefinitions.length} definitions. Starting deletion loop...`,
  );

  for (const def of productDefinitions) {
    if (def.namespace === appNamespace) {
      console.log(`Attempting to delete: "${def.name}" (ID: ${def.id})`);

      const deletedId = await deleteMetafieldDefinition(def.id, admin);
      await prisma.metafieldDefinition.delete({
        where: {
          key: def.key,
        },
      });
      if (deletedId) {
        deletionCount++;
        console.log(`[SUCCESS] Deleted: ${deletedId}`);
      } else {
        failureCount++;
        console.error(`[FAILURE] Failed to delete ID: ${def.id}`);
      }
    }
  }

  console.log(`\n--- Deletion Process Complete ---`);
  console.log(`Total Found: ${productDefinitions.length}`);
  console.log(`Total Successfully Deleted: ${deletionCount}`);
  console.log(`Total Failures: ${failureCount}`);
  return {
    totalFound: productDefinitions.length,
    deleted: deletionCount,
    failed: failureCount,
  };
}
