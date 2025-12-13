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
    // 1. Получаем все ключевые слова (slugs)
    const ocValues = await externalDB.bc_ocfilter_option_value.findMany({
      where: {
        option_id: optionId,
      },
      select: {
        value_id: true,
        keyword: true, // Это ваш slug
      },
    });

    // 2. Получаем все описания (names) за один запрос
    const valueIds = ocValues.map((v) => v.value_id);
    const ocValuesDescriptions =
      await externalDB.bc_ocfilter_option_value_description.findMany({
        where: {
          value_id: { in: valueIds },
          language_id: 3, // Ваш целевой язык
        },
        select: {
          value_id: true,
          name: true,
        },
      });

    // Создаем Map для быстрого доступа к имени по value_id
    const descriptionMap = new Map<bigint, string>();
    for (const desc of ocValuesDescriptions) {
      descriptionMap.set(desc.value_id, desc.name);
    }

    // 3. Собираем пары Название/Слаг и разворачиваем их в два массива
    const names: string[] = [];
    const slugs: string[] = [];

    for (const value of ocValues) {
      const name = descriptionMap.get(value.value_id);
      if (name && value.keyword) {
        names.push(name);
        slugs.push(value.keyword);
      }
    }

    // 4. Реализация нетрадиционной логики смены массивов:

    // Проверка: содержит ли первый элемент массива 'slugs' латинские символы?
    const firstSlug = slugs[0];
    const isFirstSlugEnglish = firstSlug && /[a-z]/i.test(firstSlug);

    if (isFirstSlugEnglish) {
      console.log(
        `[Swap] Первый слаг "${firstSlug}" является латиницей. Массивы поменяны местами.`,
      );
      // Если условие истинно, меняем местами names и slugs
      return [slugs, names];
    } else {
      console.log(
        `[No Swap] Первый слаг "${firstSlug}" не является латиницей. Массивы оставлены в исходном порядке.`,
      );
      // Иначе возвращаем в исходном порядке
      return [names, slugs];
    }
  } catch (error) {
    console.error("Error in getocFilterOptionValues:", error);
    return [[], []];
  }
};
export const getFilterOptionDescriptionNames = async (optionId: number) => {
  try {
    const ocValues =
      await externalDB.bc_ocfilter_option_value_description.findMany({
        where: {
          option_id: optionId,
          language_id: 3,
        },
      });
    const map = new Map<bigint, string[]>();
    const uniqueValues = new Set<string>();
    for (const value of ocValues) {
      uniqueValues.add(value.name);
      map.set(value.value_id, Array.from(uniqueValues));
    }

    // uniqueValues.add(value.name);

    return Array.from(map);
  } catch (error) {
    console.error(error);
  }
};
