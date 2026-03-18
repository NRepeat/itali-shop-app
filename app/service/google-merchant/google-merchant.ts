import { client } from "@shared/lib/shopify/client/client";
import taxonomyMapping from "./taxonomy-mapping.json";
export const DISCOUNT_METAFIELD_KEY = "znizka";
const GET_PRODUCTS_FOR_GOOGLE_FEED = `#graphql
  query GetProductsForGoogleFeed($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      edges {
        node {
          id
          title
          handle
          description
          vendor
          productType
          updatedAt
          createdAt
     
          featuredImage {
            url
          }
          priceRangeV2 {
            maxVariantPrice {
              amount
              currencyCode
            }
          }
          metafield(namespace: "custom", key: "${DISCOUNT_METAFIELD_KEY}") {
            value
            key
          }
          category {
            fullName
            id
            name
          }
          productCategory {
            productTaxonomyNode {
              fullName
              name
            }
          }
          uk_translations: translations(locale: "uk") {
            key
            value
          }
          uk_localizations: translations(locale: "uk", marketId: "gid://shopify/Market/249692835") {
            key
            value
          }
          ru_translations: translations(locale: "ru") {
            key
            value
          }
          ru_localizations: translations(locale: "ru", marketId: "gid://shopify/Market/249692835") {
            key
            value
          }
          variants(first: 100) {
            edges {
              node {
                id
                sku
                title
                availableForSale
                price
                
                compareAtPrice 
                selectedOptions {
                  name
                  value
                }
                image {
                  url
                }
              }
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export interface GoogleFeedProduct {
  id: string;
  title: string;
  description: string;
  link: string;
  image_link: string;
  condition: string;
  price: string;
  availability: string;
  brand: string;
  google_product_category: string;
  gender: string;
  age_group: string;
  color?: string;
  size?: string;
  item_group_id: string;
}

function escapeXml(unsafe: string): string {
  if (!unsafe) return "";
  return unsafe.replace(/[<>&"']/g, (c) => {
    switch (c) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case '"':
        return "&quot;";
      case "'":
        return "&apos;";
      default:
        return c;
    }
  });
}

export async function generateGoogleMerchantXml(
  locale: "uk" | "ru" = "uk",
  session: {
    accessToken: string;
    shop: string;
  } | null,
): Promise<string> {
  if (!session?.accessToken || !session.shop) {
    throw new Error("No Shopify session found");
  }
  const isUk = locale === "uk";
  const titleText = isUk
    ? "MioMio - Італійське взуття та одяг"
    : "MioMio - Итальянская обувь и одежда";
  const descriptionText = isUk
    ? "Магазин оригінального італійського одягу та взуття"
    : "Магазин оригинальной итальянской одежды и обуви";

  let xml = `<?xml version="1.0"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
  <channel>
    <title>${titleText}</title>
    <link>https://www.miomio.com.ua</link>
    <description>${descriptionText}</description>`;

  let hasNextPage = true;
  let cursor: string | null = null;
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL || "https://www.miomio.com.ua";

  const typedTaxonomyMapping = taxonomyMapping as Record<string, string>;

  while (hasNextPage) {
    const response: any = await client.request({
      query: GET_PRODUCTS_FOR_GOOGLE_FEED,
      variables: { first: 10, after: cursor },
      accessToken: session.accessToken,
      shopDomain: session.shop,
    });

    if (!response.products?.edges) break;

    for (const edge of response.products.edges) {
      const product = edge.node;
      const currencyCode = product.priceRangeV2?.maxVariantPrice?.currencyCode;
      const price = product.priceRangeV2?.maxVariantPrice?.amount;
      const discount = product.metafield?.value
        ? parseFloat(product.metafield.value)
        : 0;
      const translations = isUk
        ? product.uk_translations
        : product.ru_translations;
      const localizations = isUk
        ? product.uk_localizations
        : product.ru_localizations;

      const getTranslatedValue = (key: string, defaultVal: string) => {
        const loc = localizations?.find((t: any) => t.key === key)?.value;
        if (loc) return loc;
        const trans = translations?.find((t: any) => t.key === key)?.value;
        if (trans) return trans;
        return defaultVal;
      };

      const translatedTitle = getTranslatedValue("title", product.title);
      const translatedDescription = getTranslatedValue(
        "body_html",
        product.description || product.title,
      );

      // 1. Prioritize mapped Google Category from Shopify Taxonomy ID
      // 2. Fallback to Shopify Standard Taxonomy fullName
      // 3. Fallback to productType
      // 4. Default fallback
      const shopifyCategoryId = product.category?.id;
      const mappedGoogleCategory = shopifyCategoryId
        ? typedTaxonomyMapping[shopifyCategoryId]
        : null;

      const googleCategory = escapeXml(
        mappedGoogleCategory ||
          product.productCategory?.productTaxonomyNode?.fullName ||
          product.productType ||
          (isUk ? "Взуття та аксесуари" : "Обувь и аксессуары"),
      );

      const internalProductType = escapeXml(
        product.productType ||
          product.productCategory?.productTaxonomyNode?.name ||
          product.category?.name ||
          (isUk ? "Взуття та аксесуари" : "Обувь и аксессуары"),
      );

      for (const variantEdge of product.variants.edges) {
        const variant = variantEdge.node;

        // Calculate price with discount
        const originalPrice = parseFloat(variant.price);
        const finalPrice =
          discount > 0 ? originalPrice * (1 - discount / 100) : originalPrice;
        const priceStr = `${finalPrice.toFixed(2)} ${currencyCode}`;
      console.log(discount,originalPrice,finalPrice,currencyCode)

        const id = variant.sku || variant.id.split("/").pop();
        const title = escapeXml(`${product.vendor} ${translatedTitle}`);
        const description = escapeXml(translatedDescription || translatedTitle);
        const link = `${baseUrl}/${locale}/product/${product.handle}?variant=${variant.id.split("/").pop()}`;
        const imageLink =
          variant.image?.url || product.featuredImage?.url || "";
        const availability =
          variant.availableForSale &&
          (variant.quantityAvailable === null || variant.quantityAvailable > 0)
            ? "in_stock"
            : "out_of_stock";

        const colorOpt = variant.selectedOptions.find((o: any) =>
          ["color", "колір", "цвет"].includes(o.name.toLowerCase()),
        );
        const sizeOpt = variant.selectedOptions.find((o: any) =>
          ["size", "розмір", "размер"].includes(o.name.toLowerCase()),
        );

        const gender = product.handle.includes("cholov")
          ? "male"
          : product.handle.includes("zhinoch")
            ? "female"
            : "unisex";

        xml += `
    <item>
      <g:id>${id}</g:id>
      <g:title>${title}</g:title>
      <g:description>${description}</g:description>
      <g:link>${link}</g:link>
      <g:image_link>${imageLink}</g:image_link>
      <g:condition>new</g:condition>
      <g:price>${priceStr}</g:price>
      <g:availability>${availability}</g:availability>
      <g:brand>${escapeXml(product.vendor)}</g:brand>
      <g:google_product_category>${googleCategory}</g:google_product_category>
      <g:product_type>${internalProductType}</g:product_type>
      <g:gender>${gender}</g:gender>
      <g:age_group>adult</g:age_group>
      <g:identifier_exists>no</g:identifier_exists>
      <g:item_group_id>${product.handle}</g:item_group_id>`;

        if (colorOpt) {
          xml += `
      <g:color>${escapeXml(colorOpt.value)}</g:color>`;
        }
        if (sizeOpt) {
          xml += `
      <g:size>${escapeXml(sizeOpt.value)}</g:size>`;
        }

        xml += `
    </item>`;
      }
    }

    hasNextPage = response.products.pageInfo.hasNextPage;
    // hasNextPage = false
    cursor = response.products.pageInfo.endCursor;
  }

  xml += `
  </channel>
</rss>`;

  return xml;
}
