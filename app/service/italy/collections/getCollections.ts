import { externalDB } from "@shared/lib/prisma/prisma.server";
import {
  bc_category,
  bc_category_description,
} from "~/prisma/generated/external_client/client";
export type ExistingCollection = bc_category & {
  description: bc_category_description | null;
};

export const getCollections = async () => {
  try {
    const collectionWithDesc: ExistingCollection[] = [];
    const existCollections = await externalDB.bc_category.findMany();
    for (const collection of existCollections) {
      const description = await externalDB.bc_category_description.findFirst({
        where: {
          category_id: collection.category_id,
        },
      });
      collectionWithDesc.push({ ...collection, description });
    }
    return collectionWithDesc as [];
  } catch (err) {
    throw new Error(err.message);
  }
};
