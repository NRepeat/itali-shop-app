import { externalDB } from "@shared/lib/prisma/prisma.server";

export const fetchProductData = async (product: any) => {
  const productId = product.product_id;
  const productDiscription = await externalDB.bc_product_description.findMany({
    where: { product_id: productId, language_id: { in: [1, 3] } },
  });

  const russianDescription = productDiscription.find(
    (d) => d.language_id === 1,
  );

  const productImages = await externalDB.bc_product_image.findMany({
    where: { product_id: productId },
  });

  const ukrainianDescription = productDiscription.find(
    (d) => d.language_id === 3,
  );

  if (!ukrainianDescription) {
    return null;
  }

  const productOptions = await externalDB.bc_product_option.findMany({
    where: { product_id: productId },
  });

  const productOptionValue = await externalDB.bc_product_option_value.findMany({
    where: {
      product_id: productId,
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

  const optionValues = await externalDB.bc_option_value_description.findMany({
    where: {
      language_id: 3,
      option_value_id: {
        in: productOptionValue.map((option) => option.option_value_id),
      },
    },
  });

  const optionDescriptions = await externalDB.bc_option_description.findMany({
    where: {
      language_id: 3,
      option_id: { in: options.map((option) => option.option_id) },
    },
  });

  const bcTags = await externalDB.bc_product_to_category.findMany({
    where: { product_id: productId },
  });

  const bcTagsDescription = await externalDB.bc_category_description.findMany({
    where: {
      language_id: 3,
      category_id: {
        in: bcTags.map((tag) => tag.category_id),
      },
    },
  });
  
  const vendor = await externalDB.bc_manufacturer.findUnique({
    where: {
      manufacturer_id: product.manufacturer_id,
    },
  });

  const ocFitersToProduct =
    await externalDB.bc_ocfilter_option_value_to_product.findMany({
      where: { product_id: productId },
    });

  const filterValue = await externalDB.bc_ocfilter_option_value.findMany({
    where: {
      value_id: {
        in: ocFitersToProduct.map((filter) => filter.value_id),
      },
    },
  });

  const bc_ocfilter_option = await externalDB.bc_ocfilter_option.findMany({
    where: {
      option_id: { in: filterValue.map((filter) => filter.option_id) },
    },
  });

  return {
    productDiscription,
    productImages,
    ukrainianDescription,
    productOptions,
    productOptionValue,
    options,
    optionValues,
    optionDescriptions,
    bcTags,
    bcTagsDescription,
    vendor,
    ocFitersToProduct,
    filterValue,
    bc_ocfilter_option,
    russianDescription,
  };
};
