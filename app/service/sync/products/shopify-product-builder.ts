import { getMetafields } from "@/service/shopify/metafields/getMetafields";
import {
  InputMaybe,
  OptionSetInput,
  MetafieldOwnerType,
  ProductVariantSetInput,
  ProductVariantInventoryPolicy,
  FileSetInput,
  FileContentType,
  MetafieldInput,
} from "@/types";
import { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { externalDB, prisma } from "@shared/lib/prisma/prisma.server";

/**
 * Looks up a metaobject GID from local DB only.
 * Returns the GID if found, null otherwise (no creation, no Shopify API call).
 */
const lookupMetaobject = async (
  admin: AdminApiContext,
  handle: string,
  type: string,
): Promise<string | null> => {
  if (!handle) return null;
  const local = await prisma.metaobject.findUnique({ where: { handle } });
  let metaobjectId;
  if (!local) {
    const query = `query ShopName($handle: String!, $type: String!) {
	metaobjectByHandle(handle:{handle:$handle,type:$type}){
    id
    type
	}
}`;
    const rest = await admin.graphql(query, {
      variables: { handle, type },
    });
    if (rest) {
      metaobjectId = rest.data.metaobjectByHandle?.id;
    }
  } else {
    metaobjectId = local.metaobjectId;
  }

  return metaobjectId ?? null;
};

// Helper function to generate Cartesian product of arrays
const cartesian = <T>(...args: T[][]): T[][] => {
  const r: T[][] = [];
  const max = args.length - 1;
  const helper = (arr: T[], i: number) => {
    for (let j = 0, l = args[i].length; j < l; j++) {
      const a = arr.slice(0); // clone arr
      a.push(args[i][j]);
      if (i === max) {
        r.push(a);
      } else {
        helper(a, i + 1);
      }
    }
  };
  helper([], 0);
  return r;
};

export const buildProductOptions = async (
  admin: AdminApiContext,
  productOptions: any[],
  optionDescriptions: any[],
  optionValues: any[],
  productOptionValue: any[],
) => {
  const sProductOptions: InputMaybe<OptionSetInput[]> | undefined = [];
  const colorMapping = {
    Блакитний: "blakitnij",
    Рожевий: "rozhevij",
    Фіолетовий: "fioletovij",
    Коричневий: "korichnevij",
    Гірчичний: "girchichnij",
    Бордовий: "bordovij",
    Червоний: "chervonij",
    Срібло: "sriblo",
    Зелений: "zelenij",
    Жовтий: "zhovtij",
    Хакі: "haki",
    Помаранчевий: "pomaranchevij",
    Рудий: "rudij",
    Синій: "sinij",
    Бежевий: "bilij",
    Чорний: "chornij",
    Білий: "bilij",
    Золото: "zoloto",
    Бронзовий: "bronzovij",
    Сірий: "sirij",
    Мультиколор: "multikolor",
    "М'ятний": "m-jatnij",
    Пітон: "piton",
  };

  if (!productOptions || productOptions.length === 0) {
    sProductOptions.push({
      name: "Title",
      values: [{ name: "Default Title" }],
    });
  } else {
    for (const option of productOptions) {
      const optionId = option.option_id;
      const optionName = optionDescriptions.find(
        (o) => o.option_id === optionId,
      );

      const relevantOptionValueIds = productOptionValue
        .filter((pov) => pov.option_id === optionId)
        .map((pov) => pov.option_value_id);
      const relevantOptionValues = optionValues.filter((ov) =>
        relevantOptionValueIds.includes(ov.option_value_id),
      );

      const existOptionMetafields = await getMetafields(admin, {
        ownerType: "PRODUCT" as MetafieldOwnerType.Product,
        first: 1, 
        query: optionName?.name,
      });

      if (!existOptionMetafields || !existOptionMetafields[0]) {
        console.warn(
          `[buildProductOptions] No metafield definition for option "${optionName?.name}" — falling back to plain string values`,
        );
        if (relevantOptionValues.length > 0) {
          sProductOptions.push({
            name: optionName?.name,
            values: relevantOptionValues.map((ov) => ({ name: ov.name })),
          });
        }
        continue;
      }
      const rawType = existOptionMetafields[0].key || "";
      const type = existOptionMetafields[0].key || "";
      const metafieldKey = rawType;

      if (optionName?.name === "Колір") {
        const values: string[] = [];
        for (const ov of relevantOptionValues) {
          const colorHandle = colorMapping[ov.name];
          if (!colorHandle) {
            console.warn(
              `[buildProductOptions] Color "${ov.name}" not in colorMapping, skipping`,
            );
            continue;
          }
          const id = await lookupMetaobject(admin, colorHandle, type);
          if (id) values.push(id);
        }
        if (values.length > 0) {
          sProductOptions.push({
            name: optionName?.name,
            linkedMetafield: { key: metafieldKey, namespace: "custom", values },
          });
        } else if (relevantOptionValues.length > 0) {
          sProductOptions.push({
            name: optionName?.name,
            values: relevantOptionValues.map((ov) => ({ name: ov.name })),
          });
        }
      } else {
        const values: string[] = [];
        for (const ov of relevantOptionValues) {
          const handle = ov.name.toLowerCase().replace(",", "-");
          const id = await lookupMetaobject(admin, handle, type);
          if (id) values.push(id);
        }
        if (values.length > 0) {
          sProductOptions.push({
            name: optionName?.name,
            linkedMetafield: { key: metafieldKey, namespace: "custom", values },
          });
        } else if (relevantOptionValues.length > 0) {
          sProductOptions.push({
            name: optionName?.name,
            values: relevantOptionValues.map((ov) => ({ name: ov.name })),
          });
        }
      }
    }
  }

  return sProductOptions;
};

export const buildProductVariants = async (
  admin: AdminApiContext,
  product: any,
  productOptionValue: any[],
  optionValues: any[],
  optionDescriptions: any[],
) => {
  const variants: ProductVariantSetInput[] = [];
  const colorMapping = {
    Блакитний: "blakitnij",
    Рожевий: "rozhevij",
    Фіолетовий: "fioletovij",
    Коричневий: "korichnevij",
    Гірчичний: "girchichnij",
    Бордовий: "bordovij",
    Червоний: "chervonij",
    Срібло: "sriblo",
    Зелений: "zelenij",
    Жовтий: "zhovtij",
    Хакі: "haki",
    Помаранчевий: "pomaranchevij",
    Рудий: "rudij",
    Синій: "sinij",
    Бежевий: "bilij",
    Чорний: "chornij",
    Білий: "bilij",
    Золото: "zoloto",
    Бронзовий: "bronzovij",
    Сірий: "sirij",
    Мультиколор: "multikolor",
    "М'ятний": "m-jatnij",
    Пітон: "piton",
  };

  const optionsMap = new Map<number, any[]>();

  if (productOptionValue.length === 0) {
    variants.push({
      price: product.price.toString(),
      inventoryPolicy: "DENY" as ProductVariantInventoryPolicy,
      inventoryQuantities: [
        {
          name: "available",
          quantity: 1,
          locationId: "gid://shopify/Location/78249492642",
        },
      ],
      sku: product.model,
      inventoryItem: {
        tracked: true,
        requiresShipping: true,
        cost: product.price.toString(),
      },
      optionValues: [{ name: "Default Title", optionName: "Title" }],
      metafields: [
        {
          namespace: "custom",
          key: "at_the_fitting",
          type: "boolean",
          value: "false",
        },
      ],
    });
  } else {
    productOptionValue.forEach((pov) => {
      if (!optionsMap.has(pov.option_id)) optionsMap.set(pov.option_id, []);
      optionsMap.get(pov.option_id)!.push(pov);
    });

    const optionValueGroups = Array.from(optionsMap.values());
    if (optionValueGroups.length === 0) return [];

    const combinations = cartesian(...optionValueGroups);

    for (const combo of combinations) {
      const optionValuesForVariant = [];
      let variantQuantity = Infinity;

      for (const pov of combo) {
        const optionValueDesc = optionValues.find(
          (ovd) => ovd.option_value_id === pov.option_value_id,
        );
        const optionDesc = optionDescriptions.find(
          (od) => od.option_id === pov.option_id,
        );
        if (!optionDesc || !optionValueDesc) continue;

        const existOptionMetafields = await getMetafields(admin, {
          ownerType: "PRODUCT" as MetafieldOwnerType.Product,
          first: 1,
          query: optionDesc.name,
        });

        if (!existOptionMetafields[0]) {
          console.warn(
            `[buildProductVariants] No metafield definition for option "${optionDesc.name}" — using plain value`,
          );
          optionValuesForVariant.push({
            optionName: optionDesc.name,
            name: optionValueDesc.name,
          });
          variantQuantity = Math.min(variantQuantity, pov.quantity);
          continue;
        }

        const type = existOptionMetafields[0].key

        let metaobjectId: string | null = null;
        if (optionDesc.name === "Колір") {
          const colorHandle = colorMapping[optionValueDesc.name];
          if (colorHandle) {
            metaobjectId = await lookupMetaobject(admin, colorHandle, type);
          } else {
            console.warn(
              `[buildProductVariants] Color "${optionValueDesc.name}" not in colorMapping, skipping linked value`,
            );
          }
        } else {
          const handle = optionValueDesc.name.toLowerCase().replace(",", "-");
          metaobjectId = await lookupMetaobject(admin, handle, type);
        }

        if (!metaobjectId) {
          console.warn(
            `[buildProductVariants] Metaobject not found for "${optionValueDesc.name}" (option "${optionDesc.name}") — using plain value`,
          );
          optionValuesForVariant.push({
            optionName: optionDesc.name,
            name: optionValueDesc.name,
          });
          variantQuantity = Math.min(variantQuantity, pov.quantity);
          continue;
        }

        optionValuesForVariant.push({
          optionName: optionDesc.name,
          linkedMetafieldValue: metaobjectId,
        });
        variantQuantity = Math.min(variantQuantity, pov.quantity);
      }

      if (optionValuesForVariant.length !== optionsMap.size) continue;

      variants.push({
        price: product.price.toString(),
        inventoryPolicy: "DENY" as ProductVariantInventoryPolicy,
        inventoryQuantities: [
          {
            name: "available",
            quantity: variantQuantity === Infinity ? 0 : variantQuantity,
            locationId: "gid://shopify/Location/78249492642",
          },
        ],
        sku: product.model,
        inventoryItem: {
          tracked: true,
          requiresShipping: true,
          cost: product.price.toString(),
        },
        optionValues: optionValuesForVariant,
        metafields: [
          {
            namespace: "custom",
            key: "at_the_fitting",
            type: "boolean",
            value: combo.some((pov) => pov.reserved) ? "true" : "false",
          },
        ],
      });
    }
  }

  return variants;
};

export const buildTags = async (
  product: any,
  bcTagsDescription: any[],
  ukrainianDescription: any,
) => {
  const tags: string[] = bcTagsDescription.map((tag) => tag.name.toString());
  for (const bTD of bcTagsDescription) {
    const category = await externalDB.bc_category.findFirst({
      where: { category_id: bTD.category_id },
    });
    if (category?.parent_id && category.parent_id > 0) {
      const parrent = await externalDB.bc_category.findFirst({
        where: { category_id: category.parent_id },
      });
      if (parrent) {
        const parrentDescription =
          await externalDB.bc_category_description.findFirst({
            where: { language_id: 3, category_id: parrent.category_id },
          });
        const tag = parrentDescription?.name;
        if (tag) tags.push(tag);
      }
    }
  }

  if (product.new && product.new === 1) tags.push("new");
  if (product.rasprodaja && product.rasprodaja === 1) tags.push("sale");
  if (ukrainianDescription && ukrainianDescription.tag) {
    tags.push(...ukrainianDescription.tag.split(", "));
  }

  return [...new Set(tags)];
};

export const buildFiles = (
  product: any,
  productImages: any[],
  ukrainianDescription: any,
): FileSetInput[] => {
  return [product, ...productImages]
    .filter((f) => f && f.image)
    .map((f) => {
      const encodedImagePath = encodeURI(f.image);
      return {
        originalSource: "https://italishoes.com.ua/image/" + encodedImagePath,
        alt: ukrainianDescription?.image_alt || "",
        contentType: "IMAGE" as FileContentType.Image,
      };
    });
};

export const buildMetafields = async (
  admin: AdminApiContext,
  filterValue: any[],
  bc_ocfilter_option: any[],
) => {
  const mapFiltersByOption = (filterValue, bc_ocfilter_option) => {
    const optionsMap = bc_ocfilter_option.reduce((acc, option) => {
      acc[option.option_id] = { ...option, values: [] };
      return acc;
    }, {});
    filterValue.forEach((value) => {
      if (optionsMap[value.option_id])
        optionsMap[value.option_id].values.push(value);
    });
    return optionsMap;
  };

  const mappedFilters = mapFiltersByOption(filterValue, bc_ocfilter_option);

  const productMetafieldsmetObjects: MetafieldInput[] = [];

  for (const key of Object.keys(mappedFilters)) {
    const existOptionMetafields = await getMetafields(admin, {
      ownerType: "PRODUCT" as MetafieldOwnerType.Product,
      first: 1,
      key: mappedFilters[key].keyword,
    });
    if (!existOptionMetafields || !existOptionMetafields[0]) continue;

    const type = existOptionMetafields[0].key
    const mmm: string[] = [];

    for (const v of mappedFilters[key].values) {
      if (!v.keyword) continue;
      const id = await lookupMetaobject(admin, v.keyword, type);
      if (id) mmm.push(id);
    }

    if (mmm.length > 0) {
      productMetafieldsmetObjects.push({
        key: type,
        namespace: "custom",
        type: "list.metaobject_reference",
        value: JSON.stringify(mmm),
      });
    }
  }

  return productMetafieldsmetObjects;
};
