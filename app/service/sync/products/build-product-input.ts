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
  productMetafieldsmetObjects: MetafieldInput[],
  category: string,
): ProductSetInput => {
  const cleanedDescription = ukrainianDescription.description
    .replace(/&lt;p&gt;/g, '<p>')
    .replace(/&lt;\/p&gt;/g, '</p>')
    .replace(/&lt;br&gt;/g, '<br>');
  const input: ProductSetInput = {
    title: ukrainianDescription.name,
    descriptionHtml: cleanedDescription,
    handle: ukrainianDescription.seo_keyword,
    status: "ACTIVE" as InputMaybe<ProductStatus>,
    category: category,
    productOptions: sProductOptions,
    variants: variants,
    files: files,
    vendor: vendor?.name,
    tags: tags,
    metafields: [
      {
        key: "meta-keyword",
        value: ukrainianDescription.meta_keyword,
        namespace: "custom",
        type: "single_line_text_field",
      },
      ...productMetafieldsmetObjects,
    ],
    seo: {
      description: ukrainianDescription.meta_description.replace(/&quot;/g, '"'),
      title: ukrainianDescription.meta_title,
    },
  };
  return input;
};
