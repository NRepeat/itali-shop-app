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
import { CreateProductAsynchronousMutationVariables } from "@/types";
import { client } from "../client/shopify";
import { categoryMap } from "@/service/maps/categoryMaps";
import { externalDB } from "@shared/lib/prisma/prisma.server";
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import path from "path";

// Helper function to create a map from full category name to category ID
const createShopifyCategoryMap = (categories: any[]): Map<string, string> => {
    const idToCategory = new Map(categories.map(c => [c.id, c]));
    const idToFullName = new Map<string, string>();

    const getFullName = (catId: string): string => {
        if (idToFullName.has(catId)) {
            return idToFullName.get(catId)!;
        }

        const category = idToCategory.get(catId);
        if (!category) return '';

        const parent = categories.find(p => p.children?.includes(catId));
        
        const fullName = parent 
            ? `${getFullName(parent.id)} > ${category.name}`
            : category.name;

        idToFullName.set(catId, fullName);
        return fullName;
    }

    const nameToIdMap = new Map<string, string>();
    for (const cat of categories) {
        nameToIdMap.set(getFullName(cat.id), cat.id);
    }
    return nameToIdMap;
};

// Load and parse the Shopify category taxonomy file
const shopifyCategoryYaml = fs.readFileSync(path.resolve('app/service/maps/shopify_category'), 'utf8');
const shopifyCategories = yaml.load(shopifyCategoryYaml) as any[];
const shopifyCategoryNameToIdMap = createShopifyCategoryMap(shopifyCategories);


export const processSyncTask = async (job: Job) => {
  const { product, domain, shop, accessToken } = job.data;

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
    } = productData;

    // --- Dynamic Category Logic ---
    const productToCategory = await externalDB.bc_product_to_category.findFirst({
        where: { product_id: product.product_id },
        orderBy: { main_category: "desc" },
    });

    let shopifyCategoryGid = "gid://shopify/TaxonomyCategory/aa"; // Default value

    if (productToCategory) {
        const categoryDescription = await externalDB.bc_category_description.findFirst({
            where: {
                category_id: productToCategory.category_id,
                language_id: 3 // Assuming language_id 3 is Ukrainian
            }
        });

        if (categoryDescription && categoryMap[categoryDescription.name]) {
            const googleTaxonomyName = categoryMap[categoryDescription.name];
            const shopifyCategoryId = shopifyCategoryNameToIdMap.get(googleTaxonomyName);

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
      productDiscription,
    );

    const files = buildFiles(product, productImages, productDiscription);

    const productMetafieldsmetObjects = await buildMetafields(
      admin as any,
      filterValue,
      bc_ocfilter_option,
    );

    const input = buildProductInput(
      ukrainianDescription,
      sProductOptions,
      variants,
      files,
      vendor,
      tags,
      productDiscription,
      productMetafieldsmetObjects,
      shopifyCategoryGid,
    );

    const productInput: CreateProductAsynchronousMutationVariables = {
      synchronous: false,
      productSet: input,
    };
    console.log(JSON.stringify(productInput, null, 2));
    await createProductAsynchronous(domain, productInput);

    console.log(`Product ${product.product_id} synced successfully.`);
  } catch (e) {
    console.log(e);
    throw e;
  }
};
