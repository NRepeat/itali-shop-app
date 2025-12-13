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

    const sProductOptions = await buildProductOptions(
      admin as any, // casting to any to satisfy the type checker
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
