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

export const buildProductOptions = async (
  admin: AdminApiContext,
  productOptions: any[],
  optionDescriptions: any[],
  optionValues: any[],
) => {
  const sProductOptions: InputMaybe<OptionSetInput[]> | undefined = [];

  for (const option of productOptions) {
    const optionId = option.option_id;
    const optionName = optionDescriptions.find(
      (o) => o.option_id === optionId,
    );
    const existOptionMetafields = await getMetafields(admin, {
      ownerType: "PRODUCT" as MetafieldOwnerType.Product,
      first: 1,
      query: optionName?.name,
    });
    if (!existOptionMetafields?.metafieldDefinitions.nodes[0]) {
      continue;
    }

    const metObjects = await getMetaobject(admin, {
      first: 100,
      type: existOptionMetafields?.metafieldDefinitions.nodes[0].key,
    });

    const values = metObjects?.metaobjects.nodes
      .filter((m) => optionValues.find((o) => o.name === m.field?.value))
      .map((m) => m.id);

    const input: OptionSetInput = {
      name: optionName?.name,
      linkedMetafield: {
        key:
          existOptionMetafields?.metafieldDefinitions.nodes[0].key || "",
        namespace:
          existOptionMetafields?.metafieldDefinitions.nodes[0]
            .namespace || "",
        values: values,
      },
    };

    if (existOptionMetafields) {
      sProductOptions.push(input);
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
    for (const value of productOptionValue) {
      const optionValueDesc = optionValues.find(
        (ovd) => ovd.option_value_id === value.option_value_id,
      );
      const optionDesc = optionDescriptions.find(
        (od) => od.option_id === value.option_id,
      );
      if (!optionDesc) {
        console.warn(
          `No option description for option_id ${value.option_id}`,
        );
        continue;
      }
      const existOptionMetafields = await getMetafields(admin, {
        ownerType: "PRODUCT" as MetafieldOwnerType.Product,
        first: 1,
        query: optionDesc.name,
        key: "",
      });
      if (!existOptionMetafields?.metafieldDefinitions.nodes[0]) {
        console.warn(
          `No metafield definition for option ${optionDesc.name}`,
        );
        continue;
      }

      const metObjects = await getMetaobject(admin, {
        first: 100,
        type: existOptionMetafields.metafieldDefinitions.nodes[0].key,
      });

      const metaObject = metObjects?.metaobjects.nodes.find(
        (m) => m.field?.value === optionValueDesc?.name,
      );

      if (!metaObject) {
        console.warn(
          `No metaobject for option value ${optionValueDesc?.name}`,
        );
        continue;
      }
      const optionValuesForVariant = [
        {
          optionName: optionDesc.name,
          linkedMetafieldValue: metaObject.id,
        },
      ];

      const input: ProductVariantSetInput = {
        price: product.price.toString(),
        inventoryPolicy: "DENY" as ProductVariantInventoryPolicy,
        inventoryQuantities: [
          {
            name: "available",
            quantity: value.quantity,
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
            value: value.reserved ? "true" : "false",
          },
        ],
      };
      variants.push(input);
    }
    return variants;
}

export const buildTags = async (product: any, bcTagsDescription: any[], productDiscription: any[]) => {
    const tags: string[] = bcTagsDescription.map((tag) =>
        tag.name.toString(),
      );
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
}

export const buildFiles = (product: any, productImages: any[], productDiscription: any[]): FileSetInput[] => {
    return [product, ...productImages].map((f) => ({
        originalSource: "https://italishoes.com.ua/image/" + f.image || "",
        alt: productDiscription[0].image_alt,
        contentType: "IMAGE" as FileContentType.Image,
      }));
}

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
      const mappedFilters = mapFiltersByOption(
        filterValue,
        bc_ocfilter_option,
      );

      const keys = Object.keys(mappedFilters);

      let productMetafieldsmetObjects: MetafieldInput[] = [];
      for (const key of keys) {
        const existOptionMetafields = await getMetafields(admin, {
          ownerType: "PRODUCT" as MetafieldOwnerType.Product,
          first: 1,
          query: "",
          key: mappedFilters[key].keyword,
        });

        if (!existOptionMetafields) {
          continue;
        }
        const metObjects = await getMetaobject(admin, {
          first: 100,
          type: existOptionMetafields?.metafieldDefinitions.nodes[0].key,
        });
        const mmm = [];
        for (const v of mappedFilters[key].values) {
          for (const m of metObjects?.metaobjects.nodes) {
            if (v.keyword === m.field?.value) {
              mmm.push(m.id);
            }
          }
        }
        productMetafieldsmetObjects.push({
          key: existOptionMetafields?.metafieldDefinitions.nodes[0].key,
          namespace: "custom",
          type: "list.metaobject_reference",
          value: JSON.stringify(mmm),
        });
      }
      return productMetafieldsmetObjects;
}
