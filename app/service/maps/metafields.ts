import { externalDB } from "app/shared/lib/prisma/prisma.server";

export const getOcFilterMap = async () => {
  try {
    const ocFilters = await externalDB.bc_ocfilter_option.findMany({
      select: { keyword: true, option_id: true },
    });
    const filtersWithDescriptions = new Map<
      string,
      { description: string; filter_id: number }
    >();
    for (const filter of ocFilters) {
      const description =
        await externalDB.bc_ocfilter_option_description.findFirst({
          where: { option_id: filter.option_id, language_id: 3 },
          select: { name: true },
        });
      filtersWithDescriptions.set(filter.keyword, {
        description: description?.name || "",
        filter_id: filter.option_id,
      });
    }
    return filtersWithDescriptions;
  } catch (error) {
    console.error(error);
  }
};

export const getocFilterOptionValues = async (optionId: number) => {
  try {
    const ocValues = await externalDB.bc_ocfilter_option_value.findMany({
      where: {
        option_id: optionId,
      },
    });
    const uniqueValues = new Set<string>();
    for (const value of ocValues) {
      uniqueValues.add(value.keyword);
    }
    return Array.from(uniqueValues);
  } catch (error) {
    console.error(error);
  }
};

export const getFilterOptionDescription;
