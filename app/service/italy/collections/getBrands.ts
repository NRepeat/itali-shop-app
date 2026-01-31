import { externalDB } from "@shared/lib/prisma/prisma.server";
import {
  bc_manufacturer,
  bc_seo_manufacturer_description,
} from "~/prisma/generated/external_client/client";

export type ExistingBrand = bc_manufacturer & {
  seo: {
    rus: bc_seo_manufacturer_description | undefined;
    ukr: bc_seo_manufacturer_description | undefined;
  };
};

export const getBrands = async (): Promise<ExistingBrand[]> => {
  try {
    const [manufacturers, allDescriptions] = await Promise.all([
      externalDB.bc_manufacturer.findMany({}),
      externalDB.bc_seo_manufacturer_description.findMany({
        where: {
          language_id: { in: [1, 3] },
        },
      }),
    ]);

    const descriptionsByManufacturer = new Map<
      number,
      bc_seo_manufacturer_description[]
    >();
    for (const desc of allDescriptions) {
      const list =
        descriptionsByManufacturer.get(desc.manufacturer_id) || [];
      list.push(desc);
      descriptionsByManufacturer.set(desc.manufacturer_id, list);
    }

    return manufacturers.map((manufacturer) => {
      const descriptions =
        descriptionsByManufacturer.get(manufacturer.manufacturer_id) || [];
      return {
        ...manufacturer,
        seo: {
          rus: descriptions.find((d) => d.language_id === 1),
          ukr: descriptions.find((d) => d.language_id === 3),
        },
      };
    });
  } catch (err: any) {
    throw new Error(err.message);
  }
};
