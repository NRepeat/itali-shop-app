import {
  ProductSetInput,
  ProductUpdateInput,
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

function slugifyBrand(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Removes vendor name and (if numeric) SKU from the product title.
 * "Кросівки жіночі Fru.it 6214"  → "Кросівки жіночі"   (numeric SKU removed)
 * "Кросівки жіночі Fru.it movie" → "Кросівки жіночі movie" (alpha SKU kept)
 */
export function cleanTitle(
  title: string,
  brandName: string | null | undefined,
  model: string,
): string {
  let t = title;

  if (brandName) {
    const escaped = brandName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    t = t.replace(new RegExp(escaped, "gi"), "");
  }

  if (/^\d+$/.test(model)) {
    const escapedModel = model.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    t = t.replace(new RegExp(`(^|\\s)${escapedModel}(?=\\s|$)`, "g"), " ");
  }

  return t.replace(/\s+/g, " ").trim();
}

/**
 * Builds a clean product handle:
 * - Removes brand slug from seo_keyword
 * - If product has related articles (color variants), ensures colorSlug is present
 */
export function buildHandle(
  seoKeyword: string,
  brandName: string | null | undefined,
  model: string,
  colorSlug: string | null | undefined,
  hasRelatedArticles: boolean,
): string {
  let handle = seoKeyword.replace(/^\//, "").trim();

  if (brandName) {
    const brandSlug = slugifyBrand(brandName);
    if (brandSlug) {
      const escaped = brandSlug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      handle = handle.replace(new RegExp(`(?:^|-)${escaped}(?=-|$)`, "g"), "");
    }
  }

  handle = handle.replace(/-+/g, "-").replace(/^-|-$/g, "");

  // Color insertion disabled — add when needed
  // if (hasRelatedArticles && colorSlug && !handle.includes(colorSlug)) { ... }

  return handle;
}

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
  existingProductId?: string,
  colorSlug?: string | null,
  hasRelatedArticles?: boolean,
  model?: string,
): ProductSetInput => {
  const cleanedDescription = decodeHtmlEntities(ukrainianDescription.description);
  const discount = discountPercentage ? Number(discountPercentage) : 0;
  const resolvedModel = model ?? ukrainianDescription.seo_keyword.split("-").pop() ?? "";
  const handle = buildHandle(
    ukrainianDescription.seo_keyword,
    vendor?.name,
    resolvedModel,
    colorSlug,
    hasRelatedArticles ?? false,
  );
  const title = cleanTitle(ukrainianDescription.name, vendor?.name, resolvedModel);
  const input: ProductSetInput = {
    ...(existingProductId && { id: existingProductId }),
    title,
    descriptionHtml: cleanedDescription,
    handle,
    status: "ACTIVE" as InputMaybe<ProductStatus>,
    category: category,
    ...(sProductOptions && sProductOptions.length > 0 && { productOptions: sProductOptions }),
    ...(variants && variants.length > 0 && { variants }),
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

export const buildProductUpdateInput = (
  existingProductId: string,
  ukrainianDescription: any,
  vendor: { name: string } | null,
  tags: string[],
  productMetafieldsmetObjects: MetafieldInput[],
  category: string,
  discountPercentage: string | undefined,
  sortOrder: number,
  productType?: string,
  colorSlug?: string | null,
  hasRelatedArticles?: boolean,
  model?: string,
): ProductUpdateInput => {
  const cleanedDescription = decodeHtmlEntities(ukrainianDescription.description);
  const discount = discountPercentage ? Number(discountPercentage) : 0;
  const resolvedModel = model ?? ukrainianDescription.seo_keyword.split("-").pop() ?? "";
  const handle = buildHandle(
    ukrainianDescription.seo_keyword,
    vendor?.name,
    resolvedModel,
    colorSlug,
    hasRelatedArticles ?? false,
  );
  const title = cleanTitle(ukrainianDescription.name, vendor?.name, resolvedModel);
  return {
    id: existingProductId,
    title,
    descriptionHtml: cleanedDescription,
    handle,
    status: "ACTIVE" as InputMaybe<ProductStatus>,
    category: category,
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
};
