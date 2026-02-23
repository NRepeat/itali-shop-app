import { getMetafields } from "@/service/shopify/metafields/getMetafields";
import { getMetaobject } from "@/service/shopify/metaobjects/getMetaobject";
import { createMetaobject } from "@/service/shopify/metaobjects/createMetaobject";
import {
  InputMaybe,
  OptionSetInput,
  MetafieldOwnerType,
  ProductVariantSetInput,
  ProductVariantInventoryPolicy,
  FileSetInput,
  FileContentType,
  MetafieldInput,
  MetaobjectStatus,
} from "@/types";
import { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { externalDB, prisma } from "@shared/lib/prisma/prisma.server";

const slugifyHandle = (name: string): string =>
  name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

/**
 * Looks up a metaobject by handle+type in the local DB.
 * If not found, creates it in Shopify and persists it locally.
 * Returns the Shopify GID, or null on failure.
 */
const ensureMetaobject = async (
  admin: AdminApiContext,
  type: string,
  handle: string,
  label: string,
): Promise<string | null> => {
  if (!handle) return null;

  const existing = await prisma.metaobject.findFirst({ where: { handle, type } });
  if (existing) return existing.metaobjectId;

  const created = await createMetaobject(
    {
      metaobject: {
        type,
        handle,
        capabilities: { publishable: { status: "ACTIVE" as MetaobjectStatus } },
        fields: [
          { key: "slug", value: handle },
          { key: "label", value: label },
        ],
      },
    },
    admin,
  );

  if (!created) {
    console.warn(`[ensureMetaobject] Failed to create metaobject handle="${handle}" type="${type}"`);
    return null;
  }

  await prisma.metaobject.upsert({
    where: { handle },
    update: { metaobjectId: created.id, type: created.type },
    create: { handle, metaobjectId: created.id, type: created.type },
  });

  console.log(`[ensureMetaobject] Created metaobject handle="${handle}" type="${type}" id="${created.id}"`);
  return created.id;
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
  if(!productOptions || productOptions.length === 0){
    const input: OptionSetInput = {
      name: "Title",
      values:[{name: "Default Title"}]
      // linkedMetafield: {
      //   key: existOptionMetafields[0].type || "",
      //   namespace: "custom",
      //   values: values,
      // },
    };
      sProductOptions.push(input);
  }else if(productOptions.length>0 ){
    for (const option of productOptions) {
      const optionId = option.option_id;
      const optionName = optionDescriptions.find((o) => o.option_id === optionId);

      // Get the option values that belong specifically to this option
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
        console.warn(`[buildProductOptions] No metaobjectDefinition found for option "${optionName?.name}" — using plain values`);
        if (relevantOptionValues.length > 0) {
          sProductOptions.push({
            name: optionName?.name,
            values: [...new Set(relevantOptionValues.map((ov) => ov.name))].map((n) => ({ name: n })),
          });
        }
        continue;
      }

      const rawType = existOptionMetafields[0].type || "";
      const metafieldKey = rawType.startsWith("custom.") ? rawType.slice("custom.".length) : rawType;

      if (optionName?.name === "Колір") {
        const values: string[] = [];
        for (const ov of relevantOptionValues) {
          const colorHandle = colorMapping[ov.name];
          if (!colorHandle) {
            console.warn(`[buildProductOptions] Color "${ov.name}" not in colorMapping, skipping`);
            continue;
          }
          const id = await ensureMetaobject(admin, rawType, colorHandle, ov.name);
          if (id) values.push(id);
        }
        if (values.length > 0) {
          sProductOptions.push({
            name: optionName?.name,
            linkedMetafield: { key: metafieldKey, namespace: "custom", values },
          });
        }
      } else {
        const values: string[] = [];
        for (const ov of relevantOptionValues) {
          const handle = ov.name.toLowerCase().replace(",", "-");
          const id = await ensureMetaobject(admin, rawType, handle, ov.name);
          if (id) values.push(id);
        }
        if (values.length > 0) {
          sProductOptions.push({
            name: optionName?.name,
            linkedMetafield: { key: metafieldKey, namespace: "custom", values },
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

  // 1. Group productOptionValue by option_id
  const optionsMap = new Map<number, any[]>();

  if (productOptionValue.length === 0) {
    const input: ProductVariantSetInput = {
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
      optionValues: [{name: "Default Title", optionName: "Title"}],
      metafields: [
        {
          namespace: "custom",
          key: "at_the_fitting",
          type: "boolean",
          value: "false",
        },
      ],
    };
    variants.push(input);
  }else if(productOptionValue.length >= 1){
    console.log(productOptionValue.length,"productOptionValue--------");

    productOptionValue.forEach((pov) => {
      if (!optionsMap.has(pov.option_id)) {
        optionsMap.set(pov.option_id, []);
      }
      optionsMap.get(pov.option_id)!.push(pov);
    });

    const optionValueGroups = Array.from(optionsMap.values());
    console.log(JSON.stringify(optionValueGroups),'-----');
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

        if (!existOptionMetafields[0]) {
          // No metaobject definition for this option — plain fallback
          optionValuesForVariant.push({ optionName: optionDesc.name, name: optionValueDesc.name });
          skuParts.push(optionValueDesc.name);
          variantQuantity = Math.min(variantQuantity, pov.quantity);
          continue;
        }

        const type = existOptionMetafields[0].type;

        let metaobjectId: string | null = null;
        if (optionDesc.name === "Колір") {
          const colorHandle = colorMapping[optionValueDesc.name];
          if (colorHandle) {
            metaobjectId = await ensureMetaobject(admin, type, colorHandle, optionValueDesc.name);
          } else {
            console.warn(`[buildProductVariants] Color "${optionValueDesc.name}" not in colorMapping, skipping linked value`);
          }
        } else {
          const handle = optionValueDesc.name.toLowerCase().replace(",", "-");
          metaobjectId = await ensureMetaobject(admin, type, handle, optionValueDesc.name);
        }

        if (!metaobjectId) {
          // ensureMetaobject failed — plain fallback
          optionValuesForVariant.push({ optionName: optionDesc.name, name: optionValueDesc.name });
          skuParts.push(optionValueDesc.name);
          variantQuantity = Math.min(variantQuantity, pov.quantity);
          continue;
        }

        optionValuesForVariant.push({
          optionName: optionDesc.name,
          linkedMetafieldValue: metaobjectId,
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
            value: combo.some(pov => pov.reserved) ? "true" : "false",
          },
        ],
      };
      variants.push(input);
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
            where: {
              language_id: 3,
              category_id: parrent.category_id,
            },
          });
        const tag = parrentDescription?.name;
        if (tag) {
          tags.push(tag);
        }
      }
    }
  }

  if (product.new && product.new === 1) {
    tags.push("new");
  }
  if (product.rasprodaja && product.rasprodaja === 1) {
    tags.push("sale");
  }
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
      // The image path might contain spaces or other characters that need encoding.
      // We use encodeURI to handle this, which will correctly encode spaces as %20 etc.
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

    if (!existOptionMetafields || !existOptionMetafields[0]) {
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
