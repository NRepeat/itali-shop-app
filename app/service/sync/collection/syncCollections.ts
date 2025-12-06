import {
  ExistingCollection,
  getCollections,
} from "@/service/italy/collections/getCollections";
import { createCreateCollection } from "@/service/shopify/collections/collectionCreate";
import { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { CreateCollectionMutationVariables } from "@/types";

const groupCollectionsByCategoryId = (collections: ExistingCollection[]) => {
  const grouped = new Map<
    number,
    {
      ukr?: ExistingCollection["description"];
      rus?: ExistingCollection["description"];
    }
  >();

  for (const collection of collections) {
    if (!collection.description) continue;
    const categoryId = collection.category_id;
    if (!grouped.has(categoryId)) {
      grouped.set(categoryId, {});
    }

    if (collection.description.language_id === 3) {
      grouped.get(categoryId)!.ukr = collection.description;
    } else if (collection.description.language_id === 1) {
      grouped.get(categoryId)!.rus = collection.description;
    }
  }
  return grouped;
};

export const syncCollections = async (admin: AdminApiContext) => {
  console.log("Start collections sync");
  try {
    const existCollections = await getCollections();
    if (!existCollections) {
      console.log("No collections found");
      return;
    }
    const groupedCollections = groupCollectionsByCategoryId(existCollections);
    console.log(`Found ${existCollections.length} collections to sync`);

    for (const [categoryId, { ukr, rus }] of groupedCollections.entries()) {
      if (!ukr) {
        console.warn(
          `Пропущено колекцію ${categoryId}: немає даних українською (базова мова).`,
        );
        continue;
      }
      const baseInput: CreateCollectionMutationVariables["input"] = {
        title: ukr.name,
        handle: ukr.seo_keyword,
        descriptionHtml: ukr.description,
        seo: {
          title: ukr.meta_title,
          description: ukr.meta_description,
        },
      };
      const creationResult = await createCreateCollection(
        { input: baseInput },
        admin,
      );
      if (
        creationResult &&
        creationResult.collectionCreate?.userErrors?.length
      ) {
        console.error(
          `Помилка створення колекції ${categoryId}:`,
          creationResult.collectionCreate.userErrors,
        );
        continue;
      }
      const shopifyCollectionId =
        creationResult?.collectionCreate!.collection!.id;
      console.log(
        `Колекція ${categoryId} створена з ID: ${shopifyCollectionId}`,
      );
      if (rus) {
        const digestResult = await admin.graphql<
          TranslatableResourceQuery,
          TranslatableResourceQueryVariables
        >(GET_TRANSLATABLE_RESOURCE_QUERY, {
          variables: { id: shopifyCollectionId },
        });
      }
    }

    console.log("Collections sync finished");
  } catch (error) {
    console.error("Error during collections sync:", error);
  }
};
