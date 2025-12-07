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
    const collectionWithDesc: ExistingCollection[] = [];
    const existCollections = await externalDB.bc_category.findMany({});
    for (const collection of existCollections) {
      const description = await externalDB.bc_category_description.findMany({
        where: {
          category_id: collection.category_id,
        },
      });
      const desc = {
        rus: description.find((d) => d.language_id === 1),
        ukr: description.find((d) => d.language_id === 3),
      };
      collectionWithDesc.push({
        ...collection,
        description: desc,
      });
    }
    return collectionWithDesc as [];
  } catch (err) {
    throw new Error(err.message);
  }
};
