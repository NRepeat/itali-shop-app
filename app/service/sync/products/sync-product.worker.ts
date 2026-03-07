import { Job } from "bullmq";
import { fetchProductData } from "./data-fetcher";
import {
  buildProductOptions,
  buildProductVariants,
  buildTags,
  buildFiles,
  buildMetafields,
} from "./shopify-product-builder";
import { buildProductInput, buildHandle } from "./build-product-input";
import { setProductMetafields } from "./set-product-metafields";
import { linkProducts } from "./link-products";
import { createProductAsynchronous } from "@/service/shopify/products/api/create-shopify-product";
import { updateShopifyProduct } from "@/service/shopify/products/api/update-shopify-product";
import { findShopifyProductBySku, fetchShopifyProductTags } from "@/service/shopify/products/api/find-shopify-product";
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

// Lazy load Shopify category taxonomy
let shopifyCategoryNameToIdMap: Map<string, string> | null = null;

const getShopifyCategoryMap = async (): Promise<Map<string, string>> => {
  if (shopifyCategoryNameToIdMap) {
    return shopifyCategoryNameToIdMap;
  }
  const shopifyCategoryYaml = await fs.readFile(
    path.resolve("app/service/maps/shopify_category"),
    "utf8",
  );
  const shopifyCategories = yaml.load(shopifyCategoryYaml) as any[];
  shopifyCategoryNameToIdMap = createShopifyCategoryMap(shopifyCategories);
  return shopifyCategoryNameToIdMap;
};

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

const GET_PRODUCT_VARIANTS_QUERY = `
  #graphql
  query getProductVariants($id: ID!) {
    product(id: $id) {
      variants(first: 100) {
        nodes {
          id
          inventoryItem { id }
          selectedOptions { name value }
        }
      }
    }
  }
`;

const PRODUCT_VARIANTS_BULK_UPDATE_MUTATION = `
  #graphql
  mutation syncWorkerVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants {
        id
        inventoryItem { id }
      }
      userErrors { field message }
    }
  }
`;

const INVENTORY_SET_QUANTITIES_MUTATION = `
  #graphql
  mutation inventorySetQuantities($input: InventorySetQuantitiesInput!) {
    inventorySetQuantities(input: $input) {
      inventoryAdjustmentGroup {
        reason
        changes { name delta }
      }
      userErrors { field message }
    }
  }
`;

const LOCATION_ID = "gid://shopify/Location/78249492642";

async function updateVariantsAndInventory(
  admin: { graphql: (query: string, opts?: { variables: any }) => Promise<{ data: any }> },
  productId: string,
  newVariants: any[],
): Promise<void> {
  const { data } = await admin.graphql(GET_PRODUCT_VARIANTS_QUERY, { variables: { id: productId } });
  const existingVariants: Array<{ id: string; inventoryItem: { id: string }; selectedOptions: Array<{ name: string; value: string }> }> =
    data?.product?.variants?.nodes ?? [];

  if (existingVariants.length === 0) {
    console.log(`[VariantUpdate] No existing variants for ${productId}, skipping`);
    return;
  }

  // Match by index: productSet preserves variant order, so existingVariants[i] = newVariants[i]
  const variantUpdates: Array<{ id: string; price: string; sku?: string; inventoryPolicy: string; metafields?: any[] }> = [];
  const inventoryQuantities: Array<{ inventoryItemId: string; locationId: string; quantity: number }> = [];

  const count = Math.min(existingVariants.length, newVariants.length);
  for (let i = 0; i < count; i++) {
    const existing = existingVariants[i];
    const nv = newVariants[i];
    variantUpdates.push({
      id: existing.id,
      price: nv.price as string,
      sku: nv.sku as string | undefined,
      inventoryPolicy: nv.inventoryPolicy as string,
      metafields: nv.metafields as any[] | undefined,
    });
    const qty = (nv.inventoryQuantities as Array<{ quantity: number }> | undefined)?.[0]?.quantity ?? 0;
    inventoryQuantities.push({
      inventoryItemId: existing.inventoryItem.id,
      locationId: LOCATION_ID,
      quantity: qty,
    });
  }

  if (variantUpdates.length === 0) {
    console.log(`[VariantUpdate] No variants to update for ${productId}`);
    return;
  }

  const updateRes = await admin.graphql(PRODUCT_VARIANTS_BULK_UPDATE_MUTATION, {
    variables: { productId, variants: variantUpdates },
  });
  const updateErrors = updateRes.data?.productVariantsBulkUpdate?.userErrors ?? [];
  if (updateErrors.length > 0) {
    console.error(`[VariantUpdate] Errors:`, JSON.stringify(updateErrors));
  } else {
    console.log(`[VariantUpdate] Updated ${variantUpdates.length} variants for ${productId}`);
  }

  const invRes = await admin.graphql(INVENTORY_SET_QUANTITIES_MUTATION, {
    variables: {
      input: {
        name: "available",
        reason: "correction",
        quantities: inventoryQuantities,
      },
    },
  });
  const invErrors = invRes.data?.inventorySetQuantities?.userErrors ?? [];
  if (invErrors.length > 0) {
    console.error(`[InventoryUpdate] Errors:`, JSON.stringify(invErrors));
  } else {
    console.log(`[InventoryUpdate] Set inventory for ${inventoryQuantities.length} items`);
  }
}

export const processSyncTask = async (job: Job) => {
  const { product, domain, shop, accessToken, forceProductSet } = job.data as {
    product: Product;
    domain: string;
    shop: string;
    accessToken: string;
    forceProductSet?: boolean;
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
    let productType = "";

    if (productToCategory) {
      const categoryDescription =
        await externalDB.bc_category_description.findFirst({
          where: {
            category_id: productToCategory.category_id,
            language_id: 3, // Assuming language_id 3 is Ukrainian
          },
        });

      if (categoryDescription) {
        productType = categoryDescription.name;

        if (categoryMap[categoryDescription.name]) {
          const googleTaxonomyName = categoryMap[categoryDescription.name];
          const categoryNameMap = await getShopifyCategoryMap();
          const shopifyCategoryId = categoryNameMap.get(googleTaxonomyName);

          if (shopifyCategoryId) {
            shopifyCategoryGid = `gid://shopify/TaxonomyCategory/${shopifyCategoryId}`;
          }
        }
      }
    }
    // --- End Dynamic Category Logic ---

    // Check if product already exists in Shopify by SKU
    console.log(`[Check] Checking if product ${product.model} exists in Shopify...`);
    const existingProductId = await findShopifyProductBySku(
      product.model,
      accessToken,
      shop,
    );

    if (existingProductId) {
      console.log(`[Found] Product ${product.model} exists with ID: ${existingProductId}`);
    } else {
      console.log(`[NotFound] Product ${product.model} not found in Shopify, will create new`);
    }

    const sProductOptions = await buildProductOptions(
      admin as any,
      productOptions,
      optionDescriptions,
      optionValues,
      productOptionValue,
    );

    const variants = await buildProductVariants(
      admin as any,
      product,
      productOptionValue,
      optionValues,
      optionDescriptions,
    );
    console.log("variants",JSON.stringify(variants));
    const newTags = await buildTags(
      product,
      bcTagsDescription,
      ukrainianDescription,
    );

    // For existing products: preserve manually-added Shopify tags by merging with sync tags
    const existingTags = existingProductId
      ? await fetchShopifyProductTags(existingProductId, accessToken, shop)
      : [];
    const tags = [...new Set([...existingTags, ...newTags])];

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

    // --- Color slug for handle ---
    const colorMappingForHandle: Record<string, string> = {
      Блакитний: "blakitnij", Рожевий: "rozhevij", Фіолетовий: "fioletovij",
      Коричневий: "korichnevij", Гірчичний: "girchichnij", Бордовий: "bordovij",
      Червоний: "chervonij", Срібло: "sriblo", Зелений: "zelenij",
      Жовтий: "zhovtij", Хакі: "haki", Помаранчевий: "pomaranchevij",
      Рудий: "rudij", Синій: "sinij", Бежевий: "bilij", Чорний: "chornij",
      Білий: "bilij", Золото: "zoloto", Бронзовий: "bronzovij", Сірий: "sirij",
      Мультиколор: "multikolor", "М'ятний": "m-jatnij", Пітон: "piton",
    };
    const colorOptionDesc = optionDescriptions.find((od) => od.name === "Колір");
    let colorSlugForHandle: string | null = null;
    if (colorOptionDesc) {
      const colorPov = productOptionValue.find((pov) => pov.option_id === colorOptionDesc.option_id);
      if (colorPov) {
        const colorValDesc = optionValues.find((ov) => ov.option_value_id === colorPov.option_value_id);
        if (colorValDesc) {
          colorSlugForHandle = colorMappingForHandle[colorValDesc.name] ?? null;
        }
      }
    }

    // --- Related articles check ---
    const relatedArticles = await externalDB.bc_product_related_article.findMany({
      where: { article_id: product.product_id },
      select: { product_id: true },
    });
    const hasRelatedArticles = relatedArticles.length > 0;

    // --- End Discount Creation Logic ---
    const discountPercentage = product.extra_special?.split("|")[0];

    let shopifYproduct: { id: string } | null | undefined;

    if (existingProductId) {
      console.log(`[Update] Updating existing product via productSet ${existingProductId}`);
    } else {
      console.log(`[Create] Creating new product for ${product.product_id}`);
    }

    // Metafields connected to options cannot be set via the metafields input
    const linkedMetafieldKeys = new Set(
      (sProductOptions as any[])
        .map((opt) => opt.linkedMetafield?.key)
        .filter(Boolean),
    );
    const filteredMetafields = productMetafieldsmetObjects.filter(
      (mf) => !linkedMetafieldKeys.has(mf.key),
    );

    const input = buildProductInput(
      ukrainianDescription,
      sProductOptions,
      variants,
      files,
      vendor,
      tags,
      shopifyCategoryGid,
      productType,
      existingProductId ?? undefined,
      colorSlugForHandle,
      hasRelatedArticles,
      product.model,
    );
    const productInput: CreateProductAsynchronousMutationVariables = {
      synchronous: true,
      productSet: input,
    };
    shopifYproduct = await createProductAsynchronous(domain, productInput);

    if (shopifYproduct) {
      await prisma.productMap.upsert({
        where: { localProductId: product.product_id },
        update: { shopifyProductId: shopifYproduct.id },
        create: {
          localProductId: product.product_id,
          shopifyProductId: shopifYproduct.id,
        },
      });

      // For existing products productSet ignores inventoryQuantities — update variants+inventory separately
      if (existingProductId) {
        console.log(`[InventorySync] Updating variants and inventory for existing product ${shopifYproduct.id}`);
        await updateVariantsAndInventory(admin, shopifYproduct.id, variants);
      }

      // Set znizka, sort_order and filter metafields separately
      const discount = discountPercentage ? Number(discountPercentage) : 0;
      await setProductMetafields(shopifYproduct.id, accessToken, shop, discount, product.sort_order, filteredMetafields);

      // Link related products via metafields
      console.log(`[LinkProducts] Linking related products for ${shopifYproduct.id}`);
      await linkProducts({ product_id: product.product_id, shopifyProductId: shopifYproduct.id }, accessToken, shop);
    }

    if (!shopifYproduct) {
      throw new Error('Failed to create/update product');
    }

    // --- Russian translations ---
    if (russianDescription) {
      console.log(`[Translation] Starting RU translations for product ${shopifYproduct.id}`);
      try {
        const digestResponse = await admin.graphql(
          GET_TRANSLATABLE_PRODUCT_RESOURCE_QUERY,
          { variables: { id: shopifYproduct.id } },
        );

        if (!digestResponse.data) {
          console.error(`[Translation] Failed to fetch digests for ${shopifYproduct.id}`);
        } else {
          const digests =
            digestResponse.data?.translatableResource?.translatableContent || [];
          console.log(`[Translation] Found ${digests.length} translatable fields`);

          const translationsToRegister: TranslationInput[] = [];

          const decodeHtml = (s: string) =>
            s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'");

          const fieldsToTranslate = [
            { shopifyKey: "title", sourceValue: russianDescription.name },
            { shopifyKey: "body_html", sourceValue: decodeHtml(russianDescription.description) },
            { shopifyKey: "meta_title", sourceValue: russianDescription.meta_title },
            { shopifyKey: "meta_description", sourceValue: decodeHtml(russianDescription.meta_description) },
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

          console.log(`[Translation] Registering ${translationsToRegister.length} RU translations`);

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
                `[Translation] Error for product ${shopifYproduct.id}:`,
                JSON.stringify(registerResponse.data.translationsRegister.userErrors),
              );
            } else {
              console.log(`[Translation] RU translations registered for ${shopifYproduct.id}`);
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
                variables: { id: metafieldId },
              });

              const translatableContent = translatableMetafieldResponse.data?.translatableResource?.translatableContent;

              if (translatableContent && translatableContent.length > 0) {
                const digest = translatableContent[0].digest;
                const dedupedRuKeywords = [...new Set(
                  russianDescription.meta_keyword.split(",").map((k: string) => k.trim()).filter(Boolean),
                )].join(", ");
                const metafieldTranslations: TranslationInput[] = [{
                  locale: "ru",
                  key: "value",
                  value: dedupedRuKeywords,
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
                    `[Translation] meta-keyword error for ${shopifYproduct.id}:`,
                    JSON.stringify(registerMetafieldResponse.data.translationsRegister.userErrors),
                  );
                } else {
                  console.log(`[Translation] meta-keyword RU registered for ${shopifYproduct.id}`);
                }
              }
            }
          }
        }
      } catch (translationError: any) {
        console.error(`[Translation] Failed for product ${shopifYproduct.id}: ${translationError.message}`);
      }
    } else {
      console.log(`[Translation] No Russian description found for product ${product.product_id}, skipping translations`);
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
