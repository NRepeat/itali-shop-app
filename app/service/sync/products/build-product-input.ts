import {
  ProductSetInput,
  ProductStatus,
  InputMaybe,
  OptionSetInput,
  MetafieldInput,
  ProductVariantSetInput,
  FileSetInput,
} from "@/types";

export const buildProductInput = (
  ukrainianDescription: any,
  sProductOptions: InputMaybe<OptionSetInput[]> | undefined,
  variants: ProductVariantSetInput[],
  files: FileSetInput[],
  vendor: { name: string } | null,
  tags: string[],
  productDiscription: any[],
  productMetafieldsmetObjects: MetafieldInput[],
): ProductSetInput => {
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
  return input;
};
