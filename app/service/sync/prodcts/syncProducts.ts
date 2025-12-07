import { externalDB } from "@shared/lib/prisma/prisma.server";
import { AdminApiContext } from "@shopify/shopify-app-react-router/server";

export const syncProducts = async (admin: AdminApiContext) => {
  try {
    const allProducts = await externalDB.bc_product.findMany({
      where: {
        status: true,
      },
    });
    for (const product of allProducts) {
      const productDiscription =
        await externalDB.bc_product_description.findMany({
          where: {
            product_id: product.product_id,
            language_id: { in: [1, 3] },
          },
        });
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
      const productOptions = await externalDB.bc_product_option.findMany({
        where: {
          product_id: product.product_id,
        },
      });
      const productOptionValue =
        await externalDB.bc_product_option_value.findMany({
          where: {
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
      const optionValues = await externalDB.bc_option_value.findMany({
        where: {
          option_id: { in: options.map((option) => option.option_id) },
        },
      });
      const optionDescriptions =
        await externalDB.bc_option_description.findMany({
          where: {
            option_id: { in: options.map((option) => option.option_id) },
          },
        });

      console.log(`Product ${product.id} synced successfully.`);
    }
  } catch (e) {
    throw new Error(`Error syncing products: ${e.message}`);
  }
};
