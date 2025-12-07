import { getMetafields } from "@/service/shopify/metafields/getMetafields";
import { getMetaobject } from "@/service/shopify/metaobjects/getMetaobject";
import { createShopifyProduct } from "@/service/shopify/products/api/create-shopify-product";
import { createShopifyProductVariants } from "@/service/shopify/products/api/create-shopify-product-variants";
import {
  MetafieldOwnerType,
  OptionCreateInput,
  ProductCreateMutationMutationVariables,
  MediaContentType,
  ProductVariantInventoryPolicy,
  WeightUnit,
} from "@/types";
import { externalDB } from "@shared/lib/prisma/prisma.server";
import { AdminApiContext } from "@shopify/shopify-app-react-router/server";
// {
//   "synchronous": false,
//   "productSet": {
//     "title": "Кросівки жіночіasd",
//     "vendor": "My Brand",
//     "productType": "Взуття",
//     "descriptionHtml": "Стильні кросівки з метаполем для розмірів.",
//     "status": "ACTIVE",
//     "category": "gid://shopify/TaxonomyCategory/aa",
//     "metafields": [
//       {
//         "namespace": "custom",
//         "key": "rozmir",
//         "value": "[\"gid://shopify/Metaobject/128000098466\"]",
//         "type": "list.metaobject_reference"
//       }
//     ],
//     "productOptions": [
//       {
//         "name": "Розмір",
//         "linkedMetafield": {
//           "namespace": "custom",
//           "key": "rozmir",
//           "values": [
//             "gid://shopify/Metaobject/128000098466"
//           ]
//         }
//       }
//     ],
//     "variants": [
//       {
//         "optionValues": [
//           {
//             "optionName": "Розмір",
//             "linkedMetafieldValue": "gid://shopify/Metaobject/128000098466"
//           }
//         ],
//         "sku": "KROSIVKY-SIZE-37",
//         "price": "1999.00",
//         "inventoryQuantities": [
//           {
//             "name": "available",
//             "quantity": 10,
//             "locationId": "gid://shopify/Location/78249492642"
//           }
//         ],
//         "inventoryItem": {
//           "tracked": true,
//           "requiresShipping": true,
//           "cost": "1000.00"
//         }
//       }
//     ]
//   }
// }
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
    for (const product of allProducts.splice(0, 1)) {
      const productDiscription =
        await externalDB.bc_product_description.findMany({
          where: {
            product_id: product.product_id,
            language_id: { in: [1, 3] },
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

      const sProductOptions = (
        await Promise.all(
          productOptions.map(async (pOption) => {
            const optionId = pOption.option_id;
            const optionName = optionDescriptions.find(
              (o) => o.option_id === optionId,
            );
            const existOptionMetafields = await getMetafields(admin, {
              ownerType: "PRODUCT" as MetafieldOwnerType.Product,
              first: 1,
              query: optionName?.name,
            });

            if (!existOptionMetafields?.metafieldDefinitions.nodes[0]) {
              return null;
            }

            const metObjects = await getMetaobject(admin, {
              first: 100,
              type: existOptionMetafields?.metafieldDefinitions.nodes[0].key,
            });

            const values = metObjects?.metaobjects.nodes
              .filter(
                (m) =>
                  m.status === "ACTIVE" &&
                  optionValues.find((o) => o.name === m.field?.value),
              )
              .map((m) => m.id);
            const input: OptionCreateInput = {
              name: optionName?.name,
              linkedMetafield: {
                key:
                  existOptionMetafields?.metafieldDefinitions.nodes[0].key ||
                  "",
                namespace:
                  existOptionMetafields?.metafieldDefinitions.nodes[0]
                    .namespace || "",
                values: values,
              },
            };
            if (existOptionMetafields) {
              return input;
            }
          }),
        )
      ).filter(Boolean);

      const productInput: ProductCreateMutationMutationVariables = {
        product: {
          title: ukrainianDescription.name,
          descriptionHtml: ukrainianDescription.description,
          handle: ukrainianDescription.seo_keyword,
          productOptions: sProductOptions as any,
        },
        media: [
          ...[...productImages, product]
            .map((i) => ({
              mediaContentType: "IMAGE" as MediaContentType.Image,
              originalSource:
                "https://italishoes.com.ua/image/" + i.image || "",
            }))
            .filter((i) => i.originalSource !== ""),
        ],
      };
      console.log(JSON.stringify(productInput, null, 2));
      const createdProduct = await createShopifyProduct(domain, productInput);

      if (createdProduct) {
        const variants = (
          await Promise.all(
            productOptionValue.map(async (pov) => {
              const optionValueDesc = optionValues.find(
                (ovd) => ovd.option_value_id === pov.option_value_id,
              );
              const optionDesc = optionDescriptions.find(
                (od) => od.option_id === pov.option_id,
              );

              if (!optionDesc) {
                console.warn(
                  `No option description for option_id ${pov.option_id}`,
                );
                return null;
              }

              const existOptionMetafields = await getMetafields(admin, {
                ownerType: "PRODUCT" as MetafieldOwnerType.Product,
                first: 1,
                query: optionDesc.name,
              });

              if (!existOptionMetafields?.metafieldDefinitions.nodes[0]) {
                console.warn(
                  `No metafield definition for option ${optionDesc.name}`,
                );
                return null;
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
                return null;
              }

              const optionValuesForVariant = [
                {
                  optionName: optionDesc.name,
                  linkedMetafieldValue: metaObject.id,
                },
              ];

              return {
                price: pov.price.toString(),
                inventoryPolicy: "DENY" as ProductVariantInventoryPolicy,
                inventoryQuantities: [
                  {
                    availableQuantity: pov.quantity,
                    locationId: "gid://shopify/Location/78249492642",
                  },
                ],
                inventoryItem: {
                  sku: pov.sku,
                  tracked: true,
                  requiresShipping: true,
                  measurement: {
                    weight: {
                      value: parseFloat(pov.weight.toString()),
                      unit: "KILOGRAMS" as WeightUnit,
                    },
                  },
                },
                taxable: true,
                optionValues: optionValuesForVariant,
              };
            }),
          )
        ).filter(Boolean);

        await createShopifyProductVariants(domain, {
          productId: createdProduct.id,
          variants: variants as any,
        });
      }

      const ocFitersToProduct =
        await externalDB.bc_ocfilter_option_value_to_product.findMany({
          where: {
            product_id: product.product_id,
          },
        });
      const filterValue = await externalDB.bc_ocfilter_option_value.findMany({
        where: {
          value_id: { in: ocFitersToProduct.map((filter) => filter.value_id) },
        },
      });
      const bc_ocfilter_option = await externalDB.bc_ocfilter_option.findMany({
        where: {
          option_id: { in: filterValue.map((filter) => filter.option_id) },
        },
      });
      const attributs = await externalDB.bc_product_attribute.findMany({
        where: {
          product_id: product.product_id,
        },
      });

      console.log(`Product ${product.product_id} synced successfully.`);
    }
  } catch (e) {
    throw new Error(`Error syncing products: ${e.message}`);
  }
};
