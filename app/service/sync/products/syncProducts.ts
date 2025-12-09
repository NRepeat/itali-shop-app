import { getMetafields } from "@/service/shopify/metafields/getMetafields";
import { getMetaobject } from "@/service/shopify/metaobjects/getMetaobject";
import { createProductAsynchronous } from "@/service/shopify/products/api/create-shopify-product";
import { createShopifyProductVariants } from "@/service/shopify/products/api/create-shopify-product-variants";
import {
  MetafieldOwnerType,
  CreateProductAsynchronousMutationVariables,
  ProductVariantInventoryPolicy,
  ProductSetInput,
  ProductStatus,
  InputMaybe,
  OptionSetInput,
  MetafieldInput,
  ProductVariantSetInput,
  FileSetInput,
  FileContentType,
} from "@/types";
import { externalDB } from "@shared/lib/prisma/prisma.server";
import { AdminApiContext } from "@shopify/shopify-app-react-router/server";

export const syncProducts = async (domain: string, admin: AdminApiContext) => {
  try {
    const allProducts = await externalDB.bc_product.findMany({
      where: {
        status: true,
      },
      select: {
        product_id: true,
        model: true,
        sku: true,
        upc: true,
        ean: true,
        jan: true,
        isbn: true,
        mpn: true,
        location: true,
        quantity: true,
        stock_status_id: true,
        image: true,
        manufacturer_id: true,
        shipping: true,
        price: true,
        points: true,
        tax_class_id: true,
        weight: true,
        weight_class_id: true,
        length: true,
        width: true,
        height: true,
        length_class_id: true,
        subtract: true,
        minimum: true,
        sort_order: true,
        status: true,
        viewed: true,
        noindex: true,
        af_values: true,
        af_tags: true,
        extra_special: true,
        import_batch: true,
        meta_robots: true,
        seo_canonical: true,
        new: true,
        rasprodaja: true,
      },
    });
    for (const product of allProducts) {
      try {
        const salePercent =
          product.extra_special && String(product.extra_special).split("|")[0];

        const productDiscription =
          await externalDB.bc_product_description.findMany({
            where: {
              product_id: product.product_id,
              language_id: 3,
            },
          });

        const productImages = await externalDB.bc_product_image.findMany({
          where: {
            product_id: product.product_id,
          },
        });
        const ukrainianDescription = productDiscription.find(
          (d) => d.language_id === 3,
        );

        if (!ukrainianDescription) {
          console.warn(
            `Skipping product ${product.product_id}: no Ukrainian description.`,
          );
          continue;
        }
        const productOptions = await externalDB.bc_product_option.findMany({
          where: {
            product_id: product.product_id,
          },
        });
        const productOptionValue =
          await externalDB.bc_product_option_value.findMany({
            where: {
              product_id: product.product_id,
              product_option_id: {
                in: productOptions.map((option) => option.product_option_id),
              },
            },
          });

        const options = await externalDB.bc_option.findMany({
          where: {
            option_id: {
              in: productOptionValue.map((option) => option.option_id),
            },
          },
        });
        const optionValues =
          await externalDB.bc_option_value_description.findMany({
            where: {
              language_id: 3,
              option_value_id: {
                in: productOptionValue.map((option) => option.option_value_id),
              },
            },
          });
        const optionDescriptions =
          await externalDB.bc_option_description.findMany({
            where: {
              language_id: 3,
              option_id: { in: options.map((option) => option.option_id) },
            },
          });
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
        // const metafields:MetafieldInput[] =  [
        //       {
        //         "namespace": "custom",
        //         "key": "rozmir",
        //         "value": "[\"gid://shopify/Metaobject/128000098466\"]",
        //         "type": "list.metaobject_reference"
        //       }
        //     ],

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
        const bcTags = await externalDB.bc_product_to_category.findMany({
          where: {
            product_id: product.product_id,
          },
        });
        const bcTagsDescription =
          await externalDB.bc_category_description.findMany({
            where: {
              language_id: 3,
              category_id: {
                in: bcTags.map((tag) => tag.category_id),
              },
            },
          });
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

        const newProduct = product.new;

        if (newProduct && newProduct === 1) {
          tags.push("new");
        }
        if (product.rasprodaja && product.rasprodaja === 1) {
          tags.push("sale");
        }
        productDiscription.map((desc) => {
          tags.push(...desc.tag.split(", "));
        });
        const vendor = await externalDB.bc_manufacturer.findUnique({
          where: {
            manufacturer_id: product.manufacturer_id,
          },
        });
        const files: FileSetInput[] = [product, ...productImages].map((f) => ({
          originalSource: "https://italishoes.com.ua/image/" + f.image || "",
          alt: productDiscription[0].image_alt,
          contentType: "IMAGE" as FileContentType.Image,
        }));

        const ocFitersToProduct =
          await externalDB.bc_ocfilter_option_value_to_product.findMany({
            where: {
              product_id: product.product_id,
            },
          });
        const filterValue = await externalDB.bc_ocfilter_option_value.findMany({
          where: {
            value_id: {
              in: ocFitersToProduct.map((filter) => filter.value_id),
            },
          },
        });
        const bc_ocfilter_option = await externalDB.bc_ocfilter_option.findMany(
          {
            where: {
              option_id: { in: filterValue.map((filter) => filter.option_id) },
            },
          },
        );
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
        let productMetafields = [];
        let productMetafieldsmetObjects: MetafieldInput[] = [];
        for (const key of keys) {
          // continue;
          const existOptionMetafields = await getMetafields(admin, {
            ownerType: "PRODUCT" as MetafieldOwnerType.Product,
            first: 1,
            query: "",
            key: mappedFilters[key].keyword,
          });
          productMetafields.push(
            existOptionMetafields?.metafieldDefinitions.nodes[0],
          );
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
        const input: ProductSetInput = {
          title: ukrainianDescription.name,
          descriptionHtml: ukrainianDescription.description,
          handle: ukrainianDescription.seo_keyword,
          status: "ACTIVE" as InputMaybe<ProductStatus>,
          category: "gid://shopify/TaxonomyCategory/aa",
          productOptions: sProductOptions,
          variants: variants,
          files: files,
          vendor: vendor?.name,
          tags: tags,
          metafields: [
            {
              key: "meta-keyword",
              value: productDiscription[0].meta_keyword,
              namespace: "custom",
              type: "single_line_text_field",
            },
            ...productMetafieldsmetObjects,
          ],
          seo: {
            description: productDiscription[0].meta_description,
            title: productDiscription[0].meta_title,
          },
        };
        const productInput: CreateProductAsynchronousMutationVariables = {
          synchronous: false,
          productSet: input,
        };

        const createdProduct = await createProductAsynchronous(
          domain,
          productInput,
        );

        // const attributs = await externalDB.bc_product_attribute.findMany({
        //   where: {
        //     product_id: product.product_id,
        //   },
        // });

        console.log(`Product ${product.product_id} synced successfully.`);
      } catch (e) {
        console.log(e);
        continue;
      }
    }
  } catch (e) {
    throw new Error(`Error syncing products: ${e.message}`);
  }
};
