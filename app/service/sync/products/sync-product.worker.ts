import { Job } from "bullmq";
import { fetchProductData } from "./data-fetcher";
import {
  buildProductOptions,
  buildProductVariants,
  buildTags,
  buildFiles,
  buildMetafields,
} from "./shopify-product-builder";
import { buildProductInput } from "./build-product-input";
import { createProductAsynchronous } from "@/service/shopify/products/api/create-shopify-product";
import {
  CreateBasicAutomaticDiscountMutationVariables,
  CreateProductAsynchronousMutationVariables,
  DiscountBuyerSelection,
  TranslationInput,
} from "@/types";
import { client } from "../client/shopify";
import { categoryMap } from "@/service/maps/categoryMaps";
import { prisma, externalDB } from "@shared/lib/prisma/prisma.server";
import * as fs from "fs/promises";
import * as yaml from "js-yaml";
import path from "path";
import { createAttributes } from "@/service/create-attributes";
import { bc_product as Product } from "~/prisma/generated/external_client/client";
import { createAutomaticDiscount } from "@/service/shopify/discounts/create-discount";
// Helper function to create a map from full category name to category ID
const createShopifyCategoryMap = (categories: any[]): Map<string, string> => {
  const idToCategory = new Map(categories.map((c) => [c.id, c]));
  const idToFullName = new Map<string, string>();

  const getFullName = (catId: string): string => {
    if (idToFullName.has(catId)) {
      return idToFullName.get(catId)!;
    }

    const category = idToCategory.get(catId);
    if (!category) return "";

    const parent = categories.find((p) => p.children?.includes(catId));

    const fullName = parent
      ? `${getFullName(parent.id)} > ${category.name}`
      : category.name;

    idToFullName.set(catId, fullName);
    return fullName;
  };

  const nameToIdMap = new Map<string, string>();
  for (const cat of categories) {
    nameToIdMap.set(getFullName(cat.id), cat.id);
  }
  return nameToIdMap;
};

// Load and parse the Shopify category taxonomy file
const shopifyCategoryYaml = await fs.readFile(
  path.resolve("app/service/maps/shopify_category"),
  "utf8",
);
const shopifyCategories = yaml.load(shopifyCategoryYaml) as any[];
const shopifyCategoryNameToIdMap = createShopifyCategoryMap(shopifyCategories);

const TRANSLATIONS_REGISTER_MUTATION = `
  #graphql
  mutation translationsRegister($resourceId: ID!, $translations: [TranslationInput!]!) {
    translationsRegister(resourceId: $resourceId, translations: $translations) {
      userErrors {
        field
        message
      }
      translations {
        key
        value
      }
    }
  }
`;

const GET_TRANSLATABLE_PRODUCT_RESOURCE_QUERY = `
   #graphql
   query translatableResource($id: ID!) {
       translatableResource(resourceId: $id) {
         translatableContent {
           key
           digest
           value
         }
       }
     }
`;
const GET_PRODUCT_METAFIELD_ID_QUERY = `
  query getProductMetafieldId($productId: ID!, $namespace: String!, $key: String!) {
    product(id: $productId) {
      metafield(namespace: $namespace, key: $key) {
        id
      }
    }
  }
`;

const GET_TRANSLATABLE_METAFIELD_QUERY = `
  query getTranslatableMetafield($id: ID!) {
    translatableResource(resourceId: $id) {
      translatableContent {
        key
        digest
        value
      }
    }
  }
`;

export const processSyncTask = async (job: Job) => {
  const { product, domain, shop, accessToken } = job.data as {
    product: Product;
    domain: string;
    shop: string;
    accessToken: string;
  };

  const admin = {
    graphql: async (query: string, options?: { variables: any }) => {
      const response = await client.request({
        query,
        variables: options?.variables,
        accessToken,
        shopDomain: shop,
      });
      return { data: response };
    },
  };

  try {
    const productData = await fetchProductData(product);

    if (!productData) {
      console.warn(
        `Skipping product ${product.product_id}: no Ukrainian description.`,
      );
      return;
    }

    const {
      productDiscription,
      productImages,
      ukrainianDescription,
      productOptions,
      productOptionValue,
      optionValues,
      optionDescriptions,
      bcTagsDescription,
      vendor,
      filterValue,
      bc_ocfilter_option,
      russianDescription,
    } = productData;

    // --- Dynamic Category Logic ---
    const productToCategory = await externalDB.bc_product_to_category.findFirst(
      {
        where: { product_id: product.product_id },
        orderBy: { main_category: "desc" },
      },
    );

    let shopifyCategoryGid = "gid://shopify/TaxonomyCategory/aa"; // Default value

    if (productToCategory) {
      const categoryDescription =
        await externalDB.bc_category_description.findFirst({
          where: {
            category_id: productToCategory.category_id,
            language_id: 3, // Assuming language_id 3 is Ukrainian
          },
        });

      if (categoryDescription && categoryMap[categoryDescription.name]) {
        const googleTaxonomyName = categoryMap[categoryDescription.name];
        const shopifyCategoryId =
          shopifyCategoryNameToIdMap.get(googleTaxonomyName);

        if (shopifyCategoryId) {
          shopifyCategoryGid = `gid://shopify/TaxonomyCategory/${shopifyCategoryId}`;
        }
      }
    }
    // --- End Dynamic Category Logic ---

    const sProductOptions = await buildProductOptions(
      admin as any,
      productOptions,
      optionDescriptions,
      optionValues,
    );

    const variants = await buildProductVariants(
      admin as any,
      product,
      productOptionValue,
      optionValues,
      optionDescriptions,
    );

    const tags = await buildTags(
      product,
      bcTagsDescription,
      ukrainianDescription,
    );

    const files = buildFiles(product, productImages, ukrainianDescription);

    const productMetafieldsmetObjects = await buildMetafields(
      admin as any,
      filterValue,
      bc_ocfilter_option,
    );

    const attributeMetaobjectGids = await createAttributes(
      product.product_id,
      admin as any,
    );

    if (attributeMetaobjectGids.length > 0) {
      productMetafieldsmetObjects.push({
        key: "attributes",
        namespace: "custom",
        type: "list.metaobject_reference",
        value: JSON.stringify(attributeMetaobjectGids),
      });
    }

    // --- End Discount Creation Logic ---
 const discountPercentage = product.extra_special?.split("|")[0];
    const input = buildProductInput(
      ukrainianDescription,
      sProductOptions,
      variants,
      files,
      vendor,
      tags,
      productMetafieldsmetObjects,
      shopifyCategoryGid,
      discountPercentage
    );

    const productInput: CreateProductAsynchronousMutationVariables = {
      synchronous: true,
      productSet: input,
    };
    const shopifYproduct = await createProductAsynchronous(
      domain,
      productInput,
    );

    if (shopifYproduct) {
      await prisma.productMap.create({
        data: {
          localProductId: product.product_id,
          shopifyProductId: shopifYproduct.id,
        },
      });
    }

    if (russianDescription && shopifYproduct) {
      const digestResponse = await admin.graphql(
        GET_TRANSLATABLE_PRODUCT_RESOURCE_QUERY,
        {
          variables: {
            id: shopifYproduct.id,
          },
        },
      );

      if (!digestResponse.data) {
        console.error(
          `Failed to fetch translatable resource for product ${shopifYproduct.id}:`,
          digestResponse,
        );
      } else {
        const digests =
          digestResponse.data?.translatableResource?.translatableContent || [];

        const translationsToRegister: TranslationInput[] = [];

        const fieldsToTranslate = [
          { shopifyKey: "title", sourceValue: russianDescription.name },
          { shopifyKey: "body_html", sourceValue: russianDescription.description
            .replace(/&lt;p&gt;/g, '<p>')
            .replace(/&lt;\/p&gt;/g, '</p>')
            .replace(/&lt;br&gt;/g, '<br>')
          },
          { shopifyKey: "meta_title", sourceValue: russianDescription.meta_title },
          { shopifyKey: "meta_description", sourceValue: russianDescription.meta_description.replace(/&quot;/g, '"') },
          { shopifyKey: "handle", sourceValue: russianDescription.seo_keyword },
        ];

        for (const field of fieldsToTranslate) {
          const digestEntry = digests.find((d) => d.key === field.shopifyKey);
          if (digestEntry && field.sourceValue) {
            translationsToRegister.push({
              locale: "ru",
              key: field.shopifyKey,
              value: field.sourceValue,
              translatableContentDigest: digestEntry.digest!,
            });
          }
        }

        if (translationsToRegister.length > 0) {
          const registerResponse = await admin.graphql(
            TRANSLATIONS_REGISTER_MUTATION,
            {
              variables: {
                resourceId: shopifYproduct.id,
                translations: translationsToRegister,
              },
            },
          );

          if (registerResponse.data?.translationsRegister?.userErrors?.length) {
            console.error(
              `Failed to register Russian translations for product ${shopifYproduct.id}:`,
              registerResponse.data.translationsRegister.userErrors,
            );
          } else {
            console.log(
              `Russian translations registered for product ${shopifYproduct.id}.`,
            );
          }
        }

        // --- Translate meta-keyword metafield ---
        if (russianDescription.meta_keyword) {
          const metafieldIdResponse = await admin.graphql(GET_PRODUCT_METAFIELD_ID_QUERY, {
            variables: {
              productId: shopifYproduct.id,
              namespace: "custom",
              key: "meta-keyword",
            },
          });

          const metafieldId = metafieldIdResponse.data?.product?.metafield?.id;

          if (metafieldId) {
            const translatableMetafieldResponse = await admin.graphql(GET_TRANSLATABLE_METAFIELD_QUERY, {
              variables: {
                id: metafieldId,
              },
            });

            const translatableContent = translatableMetafieldResponse.data?.translatableResource?.translatableContent;

            if (translatableContent && translatableContent.length > 0) {
              const digest = translatableContent[0].digest;
              const metafieldTranslations: TranslationInput[] = [{
                locale: "ru",
                key: "value",
                value: russianDescription.meta_keyword,
                translatableContentDigest: digest,
              }];

              const registerMetafieldResponse = await admin.graphql(
                TRANSLATIONS_REGISTER_MUTATION,
                {
                  variables: {
                    resourceId: metafieldId,
                    translations: metafieldTranslations,
                  },
                },
              );

              if (registerMetafieldResponse.data?.translationsRegister?.userErrors?.length) {
                console.error(
                  `Failed to register Russian translation for meta-keyword on product ${shopifYproduct.id}:`,
                  registerMetafieldResponse.data.translationsRegister.userErrors,
                );
              } else {
                console.log(
                  `Russian translation for meta-keyword registered for product ${shopifYproduct.id}.`,
                );
              }
            }
          }
        }
      }
    }

    const productsWithErrors = []
    console.log(JSON.stringify(shopifYproduct, null, 2));
    if (!shopifYproduct) {
      productsWithErrors.push({ product, error: 'Failed to create product' });
      await fs.writeFile('error_log.txt', JSON.stringify(productsWithErrors, null, 2), 'utf8');
      throw new Error('Failed to create product');
    }
    // --- Discount Creation Logic ---
    // const discountPercentage = product.extra_special?.split("|")[0];
    // let createdDiscount = null;
    // if (discountPercentage && !isNaN(Number(discountPercentage))) {
    //   const discountValue = Number(discountPercentage);
    //   if (discountValue > 0) {
    //     const discountInput: CreateBasicAutomaticDiscountMutationVariables = {
    //       basicAutomaticDiscount: {
    //         title: `${ukrainianDescription.name} - ${product.product_id}`,
    //         startsAt: new Date().toISOString(),
    //         endsAt: null,
    //         combinesWith: {
    //           productDiscounts: false,
    //           orderDiscounts: false,
    //           shippingDiscounts: false,
    //         },
    //         context: {
    //           all: "ALL" as DiscountBuyerSelection.All,
    //         },
    //         customerGets: {
    //           value: {
    //             percentage: discountValue / 100,
    //           },
    //           items: {
    //             products: {productsToAdd:[shopifYproduct?.id ]}
    //           },
    //         },
    //         minimumRequirement: {
    //           quantity: { greaterThanOrEqualToQuantity: null },
    //           subtotal: { greaterThanOrEqualToSubtotal: null },
    //         },
    //       },
    //     };

    //     createdDiscount = await createAutomaticDiscount(
    //       discountInput,
    //       accessToken,
    //       domain,
    //     );
    //     if (createdDiscount) {
    //       console.log(`Created discount:  (ID: ${createdDiscount})`);
    //     }
    //   }
    // }
    console.log(`Product ${product.product_id} synced successfully.`);
  } catch (e) {
    console.log(e);
    throw e;
  }
};
