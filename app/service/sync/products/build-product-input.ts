import {
  ProductSetInput,
  ProductStatus,
  InputMaybe,
  OptionSetInput,
  MetafieldInput,
  ProductVariantSetInput,
  FileSetInput,
} from "@/types";

const dedupeKeywords = (keywords: string): string =>
  [...new Set(keywords.split(",").map((k) => k.trim()).filter(Boolean))].join(", ");

const decodeHtmlEntities = (str: string): string =>
  str
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'");

export const buildProductInput = (
  ukrainianDescription: any,
  sProductOptions: InputMaybe<OptionSetInput[]> | undefined,
  variants: ProductVariantSetInput[],
  files: FileSetInput[],
  vendor: { name: string } | null,
  tags: string[],
  productMetafieldsmetObjects: MetafieldInput[],
  category: string,
  discountPercentage: string | undefined,
  sortOrder: number,
  productType?: string,
): ProductSetInput => {
  const cleanedDescription = decodeHtmlEntities(ukrainianDescription.description);
  const discount = discountPercentage ? Number(discountPercentage) : 0;
  const input: ProductSetInput = {
    title: ukrainianDescription.name,
    descriptionHtml: cleanedDescription,
    handle: ukrainianDescription.seo_keyword,
    status: "ACTIVE" as InputMaybe<ProductStatus>,
    category: category,
    productOptions: sProductOptions,
    variants: variants,
    files: files,
    productType: productType || undefined,
    vendor: vendor?.name,
    tags: tags,
    metafields: [
      {
        key: "meta-keyword",
        value: dedupeKeywords(ukrainianDescription.meta_keyword || ""),
        namespace: "custom",
        type: "single_line_text_field",
      },
      {
        key: "znizka",
        value: discount.toString(),
        namespace: "custom",
        type: "number_integer",
      },
      {
        key: "sort_order",
        value: sortOrder.toString(),
        namespace: "custom",
        type: "number_integer",
      },
      ...productMetafieldsmetObjects,
    ],
    seo: {
      description: decodeHtmlEntities(ukrainianDescription.meta_description),
      title: ukrainianDescription.meta_title,
    },
  };
  return input;
};
