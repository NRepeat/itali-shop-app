import { externalDB } from "@shared/lib/prisma/prisma.server";
import {
  bc_category,
  bc_category_description,
} from "~/prisma/generated/external_client/client";
export type ExistingCollection = bc_category & {
  description: {
    rus: bc_category_description | undefined;
    ukr: bc_category_description | undefined;
  };
};

export const getCollections = async () => {
  try {
    const [existCollections, allDescriptions] = await Promise.all([
      externalDB.bc_category.findMany({}),
      externalDB.bc_category_description.findMany({}),
    ]);

    const descriptionsByCategory = new Map<
      number,
      bc_category_description[]
    >();
    for (const desc of allDescriptions) {
      const list = descriptionsByCategory.get(desc.category_id) || [];
      list.push(desc);
      descriptionsByCategory.set(desc.category_id, list);
    }

    const collectionWithDesc: ExistingCollection[] = existCollections.map(
      (collection) => {
        const descriptions =
          descriptionsByCategory.get(collection.category_id) || [];
        return {
          ...collection,
          description: {
            rus: descriptions.find((d) => d.language_id === 1),
            ukr: descriptions.find((d) => d.language_id === 3),
          },
        };
      },
    );

    return collectionWithDesc as [];
  } catch (err: any) {
    throw new Error(err.message);
  }
};
