import { getMetafields } from "@/service/shopify/metafields/getMetafields";
import { getMetaobject } from "@/service/shopify/metaobjects/getMetaobject";
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
import { externalDB } from "@shared/lib/prisma/prisma.server";

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
  for (const option of productOptions) {
    const optionId = option.option_id;
    const optionName = optionDescriptions.find((o) => o.option_id === optionId);
    const existOptionMetafields = await getMetafields(admin, {
      ownerType: "PRODUCT" as MetafieldOwnerType.Product,
      first: 1,
      query: optionName?.name,
    });
    if (!existOptionMetafields) {
      continue;
    }

    const metObjects = await getMetaobject(admin, {
      first: 250,
      type: existOptionMetafields[0].type,
    });
    if (optionName?.name === "Колір") {
      const values = [];
      for (const ov of optionValues) {
        if (colorMapping[ov.name]) {
          const metaobject = metObjects.find(
            (m) => m.handle === colorMapping[ov.name],
          );
          if (metaobject) {
            values.push(metaobject.metaobjectId);
          }
        }
      }
      if (values.length > 0) {
        const input: OptionSetInput = {
          name: optionName?.name,
          linkedMetafield: {
            key: existOptionMetafields[0].type || "",
            namespace: "custom",
            values: values,
          },
        };
        if (existOptionMetafields) {
          sProductOptions.push(input);
        }
      }
    } else if (optionName?.name !== "Колір") {
      const values = [];
      for (const ov of optionValues) {
        const metaobject = metObjects.find(
          (m) =>
            m.handle.toLowerCase().replace(",", "-") ===
            ov.name.toLowerCase().replace(",", "-"),
        );
        if (metaobject) {
          values.push(metaobject.metaobjectId);
        }
      }
      if (values.length > 0) {
        const input: OptionSetInput = {
          name: optionName?.name,
          linkedMetafield: {
            key: existOptionMetafields[0].type || "",
            namespace: "custom",
            values: values,
          },
        };
        if (existOptionMetafields) {
          sProductOptions.push(input);
        }
      }
    }
  }
  console.log(sProductOptions, "sProductOptions");
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

  // 1. Group productOptionValue by option_id
  const optionsMap = new Map<number, any[]>();
  productOptionValue.forEach((pov) => {
    if (!optionsMap.has(pov.option_id)) {
      optionsMap.set(pov.option_id, []);
    }
    optionsMap.get(pov.option_id)!.push(pov);
  });

  const optionValueGroups = Array.from(optionsMap.values());

  if (optionValueGroups.length === 0) {
    return [];
  }

  // 2. Generate combinations
  const combinations = cartesian(...optionValueGroups);

  for (const combo of combinations) {
    const optionValuesForVariant = [];
    let variantQuantity = Infinity;
    const skuParts: string[] = [product.model];

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

      if (!existOptionMetafields[0]) continue;

      const metObjects = await getMetaobject(admin, {
        first: 250,
        type: existOptionMetafields[0].type,
      });

      let metaObject;
      if (optionDesc.name === "Колір") {
        const colorHandle = colorMapping[optionValueDesc.name];
        if (colorHandle) {
          metaObject = metObjects?.find((m) => m.handle === colorHandle);
        }
      } else {
        metaObject = metObjects?.find(
          (m) =>
            m.handle.toLowerCase().replace(",", "-") ===
            optionValueDesc.name.toLowerCase().replace(",", "-"),
        );
      }

      if (!metaObject) continue;

      optionValuesForVariant.push({
        optionName: optionDesc.name,
        linkedMetafieldValue: metaObject.metaobjectId,
      });
      
      skuParts.push(optionValueDesc.name);
      variantQuantity = Math.min(variantQuantity, pov.quantity);
    }
    
    // Ensure the variant is complete before adding
    if (optionValuesForVariant.length !== optionsMap.size) {
        continue;
    }

    const input: ProductVariantSetInput = {
      price: product.price.toString(),
      inventoryPolicy: "DENY" as ProductVariantInventoryPolicy,
      inventoryQuantities: [
        {
          name: "available",
          quantity: variantQuantity === Infinity ? 0 : variantQuantity,
          locationId: "gid://shopify/Location/78249492642",
        },
      ],
      sku: skuParts.join('-'),
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
          // This is tricky, as `reserved` is on a per-option-value basis.
          // We will mark as reserved if any part of the combo is reserved.
          value: combo.some(pov => pov.reserved) ? "true" : "false",
        },
      ],
    };
    variants.push(input);
  }

  return variants;
};

export const buildTags = async (
  product: any,
  bcTagsDescription: any[],
  productDiscription: any[],
) => {
  const tags: string[] = bcTagsDescription.map((tag) => tag.name.toString());
  for (const bTD of bcTagsDescription) {
    const category = await externalDB.bc_category.findFirst({
      where: { category_id: bTD.category_id },
    });
    const parrent = await externalDB.bc_category.findFirst({
      where: { parent_id: category?.parent_id },
    });
    const parrentDescription =
      await externalDB.bc_category_description.findFirst({
        where: {
          category_id: parrent?.category_id,
        },
      });
    const tag = parrentDescription?.name;
    if (tag) {
      tags.push(tag);
    }
  }

  if (product.new && product.new === 1) {
    tags.push("new");
  }
  if (product.rasprodaja && product.rasprodaja === 1) {
    tags.push("sale");
  }
  productDiscription.map((desc) => {
    tags.push(...desc.tag.split(", "));
  });

  return tags;
};

export const buildFiles = (
  product: any,
  productImages: any[],
  productDiscription: any[],
): FileSetInput[] => {
  return [product, ...productImages]
    .filter((f) => f && f.image)
    .map((f) => {
      // The image path might contain spaces or other characters that need encoding.
      // We use encodeURI to handle this, which will correctly encode spaces as %20 etc.
      const encodedImagePath = encodeURI(f.image);
      return {
        originalSource: "https://italishoes.com.ua/image/" + encodedImagePath,
        alt: productDiscription[0]?.image_alt || "",
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
      acc[option.option_id] = {
        ...option,
        values: [],
      };
      return acc;
    }, {});

    filterValue.forEach((value) => {
      const optionId = value.option_id;

      if (optionsMap[optionId]) {
        optionsMap[optionId].values.push(value);
      }
    });

    return optionsMap;
  };
  const mappedFilters = mapFiltersByOption(filterValue, bc_ocfilter_option);

  const keys = Object.keys(mappedFilters);

  let productMetafieldsmetObjects: MetafieldInput[] = [];
  for (const key of keys) {
    const existOptionMetafields = await getMetafields(admin, {
      ownerType: "PRODUCT" as MetafieldOwnerType.Product,
      first: 1,
      key: mappedFilters[key].keyword,
    });

    if (!existOptionMetafields) {
      continue;
    }
    const metObjects = await getMetaobject(admin, {
      first: 100,
      type: existOptionMetafields[0].type,
    });
    const mmm = [];
    for (const v of mappedFilters[key].values) {
      for (const m of metObjects) {
        if (v.keyword === m.handle) {
          mmm.push(m.metaobjectId);
        }
      }
    }
    productMetafieldsmetObjects.push({
      key: existOptionMetafields[0].type,
      namespace: "custom",
      type: "list.metaobject_reference",
      value: JSON.stringify(mmm),
    });
  }
  return productMetafieldsmetObjects;
};