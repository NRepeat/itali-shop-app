import { externalDB } from "@shared/lib/prisma/prisma.server";
import { AdminApiContext } from "@shopify/shopify-app-react-router/server";
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
        const productData = await fetchProductData(product);

        if (!productData) {
          console.warn(
            `Skipping product ${product.product_id}: no Ukrainian description.`,
          );
          continue;
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
          admin,
          productOptions,
          optionDescriptions,
          optionValues,
        );

        const variants = await buildProductVariants(
            admin,
            product,
            productOptionValue,
            optionValues,
            optionDescriptions
        );

        const tags = await buildTags(product, bcTagsDescription, productDiscription);

        const files = buildFiles(product, productImages, productDiscription);

        const productMetafieldsmetObjects = await buildMetafields(admin, filterValue, bc_ocfilter_option);

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

        await createProductAsynchronous(domain, productInput);

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
