import { externalDB } from "app/shared/lib/prisma/prisma.server";

export const getOcFilterMap = async () => {
  try {
    const ocFilters = await externalDB.bc_ocfilter_option.findMany({
      select: { keyword: true, option_id: true },
    });
    const filtersWithDescriptions = new Map<string, string>();
    for (const filter of ocFilters) {
      const description =
        await externalDB.bc_ocfilter_option_description.findFirst({
          where: { option_id: filter.option_id },
          select: { name: true },
        });
      filtersWithDescriptions.set(filter.keyword, description?.name || "");
    }
    return filtersWithDescriptions;
  } catch (error) {
    console.error(error);
  }
};
