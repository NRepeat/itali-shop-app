import { insertProduct, deleteProduct } from "./client";
import { Job } from "bullmq";
import { client as shopifyClient } from "@shared/lib/shopify/client/client";
import { prisma } from "@shared/lib/prisma/prisma.server";
import taxonomyMapping from "./taxonomy-mapping.json";
import { getGoogleProductCategory } from "./get-google-category";

export const googleMerchantQueueName = "googleMerchantSyncQueue";

const IGNORED_HIGHLIGHT_VALUES = new Set([
  "new",
  "sale",
  "available",
  "instock",
  "winter w",
  "summer w",
  "fw",
  "ss",
]);

/**
 * Ensures Shopify images have enough resolution for Google Merchant.
 * Non-clothing: 100x100, Clothing: 250x250.
 * We request 1024x1024 for safety and better quality.
 */
function formatImageUrl(url: string | undefined): string {
  if (!url) return "";
  if (!url.includes("cdn.shopify.com")) return url;

  // Remove existing size patterns like _small, _thumb, _100x100, etc.
  const cleanUrl = url.replace(
    /_(?:pico|icon|thumb|small|compact|medium|large|grande|(?:\d+x\d+))\./g,
    ".",
  );

  // Add 1024x1024 suffix before the extension
  return cleanUrl.replace(/\.(jpg|jpeg|png|webp|gif)/g, "_1024x1024.$1");
}

const GET_TRANSLATIONS_QUERY = `#graphql
  query getTranslations($id: ID!, $locale: String!) {
    translatableResource(resourceId: $id) {
      translations(locale: $locale) {
        key
        value
      }
    }
  }
`;

const PRODUCT_METAFIELDS_FRAGMENT = `#graphql
  fragment ProductMetafields on Product {
    metafields(first: 50) {
      edges {
        node {
          id
          key
          value
          namespace
          reference {
            ... on Metaobject {
              id
              displayName
              field(key: "label") { value }
            }
          }
          references(first: 10) {
            nodes {
              ... on Metaobject {
                id
                displayName
                field(key: "label") { value }
              }
            }
          }
        }
      }
    }
  }
`;

const GET_PRODUCT_BY_ID = `#graphql
  ${PRODUCT_METAFIELDS_FRAGMENT}
  query getProductById($id: ID!) {
    product(id: $id) {
      id
      title
      handle
      description
      vendor
      productType
      category {
        id
        fullName
      }
      tags
      uk_translations: translations(locale: "uk") { key value }
      ru_translations: translations(locale: "ru") { key value }
      featuredImage {
        url
      }
      images(first: 10) {
        edges {
          node {
            url
          }
        }
      }
      ...ProductMetafields
      variants(first: 100) {
        edges {
          node {
            id
            sku
            title
            availableForSale
            inventoryQuantity
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
`;

export async function processGoogleMerchantTask(job: Job) {
  try {
    const {
      product,
      payload,
      locale,
      baseUrl: jobBaseUrl,
      topic,
      shop,
    } = job.data;
    const baseUrl =
      jobBaseUrl ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      "https://www.miomio.com.ua";

    const isDelete =
      topic === "products/delete" || job.data.action === "delete";

    // Get session for translations and product fetch
    const session = await prisma.session.findFirst({
      where: shop ? { shop } : {},
      select: { shop: true, accessToken: true },
    });

    // Fetch full product from GraphQL if it's from a webhook payload or incomplete
    // We do this BEFORE splitting into locales to avoid multiple fetches
    let fullProduct = product || payload;
    if (!isDelete && (payload || !product?.metafields)) {
      const productId = payload?.id || product?.id;
      if (productId && session) {
        const formattedId = productId
          .toString()
          .includes("gid://shopify/Product/")
          ? productId
          : `gid://shopify/Product/${productId}`;

        console.log(
          `[Worker] Fetching full product data from Shopify for ${formattedId}`,
        );
        try {
          const res: any = await shopifyClient.request({
            query: GET_PRODUCT_BY_ID,
            variables: { id: formattedId },
            accessToken: session.accessToken,
            shopDomain: session.shop,
          });
          if (res.product) {
            console.log(
              `[Worker] Successfully fetched full product data for ${res.product.handle}`,
            );
            fullProduct = res.product;
          } else {
            console.warn(
              `[Worker] Shopify returned null for product ${formattedId}`,
            );
          }
        } catch (e) {
          console.error(
            `[Worker] Failed to fetch product ${formattedId} from Shopify:`,
            e,
          );
        }
      } else {
        console.log(
          `[Worker] Skipping fetch: productId=${productId}, hasSession=${!!session}`,
        );
      }
    }

    if (!locale) {
      console.log(
        `[Worker] Splitting task for product ${fullProduct?.handle || "unknown"} into ru and uk locales`,
      );
      const locales = ["ru", "uk"];
      for (const l of locales) {
        await processGoogleMerchantTask({
          ...job,
          data: {
            ...job.data,
            product: fullProduct,
            payload: null,
            locale: l,
            baseUrl,
          },
        } as any);
      }
      return;
    }

    const data = fullProduct;
    if (!data) {
      console.error(
        "[Worker] No data found in job payload after fetch attempt",
      );
      return;
    }

    const fetchTranslation = async (
      resourceId: string,
      locale: string,
      key: string,
    ) => {
      if (!session || locale === "uk") return null; // Default is UK
      if (!resourceId) {
        console.warn(
          `[Worker] fetchTranslation called with empty resourceId for key=${key} locale=${locale} product=${data.handle}`,
        );
        return null;
      }
      try {
        const res: any = await shopifyClient.request({
          query: GET_TRANSLATIONS_QUERY,
          variables: { id: resourceId, locale },
          accessToken: session.accessToken,
          shopDomain: session.shop,
        });
        return res.translatableResource?.translations?.find(
          (t: any) => t.key === key,
        )?.value;
      } catch (e) {
        console.warn(
          `[Worker] fetchTranslation failed for resourceId=${resourceId} key=${key} locale=${locale}:`,
          e,
        );
        return null;
      }
    };

    const handle = data.handle;
    console.log(
      `[Worker] Starting ${isDelete ? "delete" : "sync"} for: ${handle} (${locale})`,
    );

    // Нормализация метафилдов и РАЗРЕШЕНИЕ метаобъектов
    const isUk = locale === "uk";

    const metafields = await Promise.all(
      (data.metafields?.edges || []).map(async (e: any) => {
        const node = e.node;
        let displayValue = node.value;

        const resolveMetaobjectValue = async (ref: any) => {
          if (!ref) return "";
          let val = null;
          if (!isUk) {
            val = await fetchTranslation(ref.id, locale, "label");
          }
          return val || ref.field?.value || ref.displayName || "";
        };

        if (node.references?.nodes?.length > 0) {
          const values = await Promise.all(
            node.references.nodes.map((ref: any) =>
              resolveMetaobjectValue(ref),
            ),
          );
          displayValue = values.filter(Boolean).join(", ");
        } else if (node.reference) {
          displayValue = await resolveMetaobjectValue(node.reference);
        }

        return { key: node.key, value: displayValue };
      }),
    );

    const getMetafield = (key: string) => {
      return metafields.find((m: any) => m.key === key)?.value;
    };

    const discountVal = getMetafield("znizka");
    const discount = discountVal ? parseFloat(discountVal) : 0;

    // Динамические хайлайты
    const rawHighlights: string[] = [];

    const material = getMetafield("material") || getMetafield("sostav");
    const lining = getMetafield("pidkladka");
    const sole = getMetafield("pidoshva");
    const season = getMetafield("sezon");

    if (material)
      rawHighlights.push(
        isUk ? `Матеріал: ${material}` : `Материал: ${material}`,
      );
    if (lining)
      rawHighlights.push(
        isUk ? `Підкладка: ${lining}` : `Подкладка: ${lining}`,
      );
    if (sole)
      rawHighlights.push(isUk ? `Підошва: ${sole}` : `Подошва: ${sole}`);
    if (season)
      rawHighlights.push(isUk ? `Сезон: ${season}` : `Сезон: ${season}`);

    rawHighlights.push(
      isUk
        ? "Безкоштовна доставка по Україні"
        : "Бесплатная доставка по Украине",
    );
    rawHighlights.push(
      isUk
        ? "Оригінальна італійська якість"
        : "Оригинальное итальянское качество",
    );

    // Добавляем теги
    if (Array.isArray(data.tags)) {
      rawHighlights.push(...data.tags);
    }

    // ФИЛЬТРАЦИЯ МУСОРА и УМНАЯ ДЕДУПЛИКАЦИЯ в Highlights
    const uniqueHighlights = Array.from(new Set(rawHighlights));
    const productHighlights = uniqueHighlights
      .filter((h) => {
        const val = h.toLowerCase().trim();
        const isTooShort = h.length < 4;
        const isNumeric = /^\d+$/.test(h);
        const isIgnored = IGNORED_HIGHLIGHT_VALUES.has(val);
        const isTechnical = val.includes("::");

        if (isTooShort || isNumeric || isIgnored || isTechnical) return false;

        // Проверяем, не является ли этот хайлайт частью другого (более длинного) хайлайта
        const isDuplicateOfLonger = uniqueHighlights.some(
          (other) => other !== h && other.toLowerCase().includes(val),
        );

        return !isDuplicateOfLonger;
      })
      .slice(0, 6);

    // Нормализация вариантов
    let variants: any[] = [];
    if (data.variants?.edges) {
      variants = data.variants.edges.map((e: any) => e.node);
    } else if (Array.isArray(data.variants)) {
      variants = data.variants;
    }

    console.log(`[Worker] Found ${variants.length} variants for ${handle}`);

    // Category resolution
    const shopifyCategoryId = data.category?.id;
    const mappedGoogleCategory = shopifyCategoryId
      ? getGoogleProductCategory(shopifyCategoryId)
      : null;
    console.log(data.category, mappedGoogleCategory, "data.category");

    const googleProductCategory = mappedGoogleCategory || "";

    const vendor = data.vendor || "MioMio";
    const productTranslations = isUk
      ? data.uk_translations || []
      : data.ru_translations || [];
    const getTranslatedValue = (key: string, defaultVal: string) => {
      return (
        productTranslations.find((t: any) => t.key === key)?.value || defaultVal
      );
    };
    const title = getTranslatedValue("title", data.title);
    const description = getTranslatedValue(
      "body_html",
      data.description || data.body_html || title || "",
    )
      .replace(/<[^>]*>?/gm, "")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // Универсальный парсинг картинок (GraphQL или REST)
    let allImages: string[] = [];
    if (data.images?.edges) {
      allImages = data.images.edges
        .map((e: any) => formatImageUrl(e.node.url || e.node.src))
        .filter(Boolean);
    } else if (Array.isArray(data.images)) {
      allImages = data.images
        .map((img: any) => formatImageUrl(img.src || img.url))
        .filter(Boolean);
    }

    console.log(`[Worker] Found ${allImages.length} images for ${handle}`);

    for (const variant of variants) {
      const variantId = variant.id
        .toString()
        .split("/")
        .pop()
        ?.replace(/\D/g, "");
      if (!variantId) continue;

      const offerId = variantId;

      if (isDelete) {
        await deleteProduct(offerId, locale, "UA");
        continue;
      }

      const options =
        variant.selectedOptions ||
        [
          { name: "Option1", value: variant.option1 },
          { name: "Option2", value: variant.option2 },
          { name: "Option3", value: variant.option3 },
        ].filter((o: any) => o.value);

      const colorOpt = options.find((o: any) =>
        ["color", "колір", "цвет"].includes(o.name.toLowerCase()),
      );
      const sizeOpt = options.find((o: any) =>
        ["size", "розмір", "размер"].includes(o.name.toLowerCase()),
      );

      const priceAmount = parseFloat(
        variant.price?.amount || variant.price || "0",
      );
      const currencyCode =
        variant.price?.currencyCode || variant.price?.currencyCode || "UAH";

      // The "First Price" (price) is the base catalog price.
      const originalPrice = priceAmount;

      // The "Second Price" (salePrice) is the base catalog price after 'znizka'.
      const catalogPrice =
        discount > 0 ? originalPrice * (1 - discount / 100) : originalPrice;

      let finalPriceMicros = Math.round(catalogPrice * 1000000).toString();
      let originalPriceMicros = Math.round(originalPrice * 1000000).toString();

      const hasSale =
        parseFloat(originalPriceMicros) > parseFloat(finalPriceMicros);

      const availability =
        variant.availableForSale &&
        (variant.inventoryQuantity === null ||
          variant.inventoryQuantity === undefined ||
          variant.inventoryQuantity > 0)
          ? "IN_STOCK"
          : "OUT_OF_STOCK";

      console.log(
        `[Worker] variant=${variant.id} availableForSale=${variant.availableForSale} inventoryQuantity=${variant.inventoryQuantity} → ${availability}`,
      );

      const tags = data.tags || [];
      const isMale = tags.some((t: string) =>
        [
          "для чоловіків",
          "чоловіче",
          "чоловічий одяг",
          "чоловіче взуття",
        ].includes(t.toLowerCase()),
      );
      const isFemale = tags.some((t: string) =>
        ["жіноче взуття", "жіноче", "жіночий одяг"].includes(t.toLowerCase()),
      );

      let gender = "UNISEX";
      if (isMale) {
        gender = "MALE";
      } else if (isFemale) {
        gender = "FEMALE";
      } else {
        gender =
          handle.includes("cholov") ||
          handle.includes("man") ||
          handle.includes("men")
            ? "MALE"
            : handle.includes("zhinoch") ||
                handle.includes("woman") ||
                handle.includes("women")
              ? "FEMALE"
              : "UNISEX";
      }

      // FALLBACK logic for images with high quality formatting
      const mainImageLink =
        formatImageUrl(
          variant.image?.url ||
            variant.image?.src ||
            variant.image_url ||
            data.featuredImage?.url ||
            data.image?.src,
        ) ||
        allImages[0] ||
        "";
      const additionalImageLinks = allImages
        .filter((url: string) => url !== mainImageLink)
        .slice(0, 10);

      // Формируем ссылку с параметром variant, как в manual sync
      const productLink = `${baseUrl}/${locale}/product/${handle}`;

      const productInput: any = {
        offerId: offerId,
        contentLanguage: locale,
        feedLabel: "UA",
        productAttributes: {
          title: `${vendor} ${title}${sizeOpt ? ` - ${sizeOpt.value}` : ""}`,
          description: description,
          link: productLink,
          imageLink: mainImageLink,
          additionalImageLinks: additionalImageLinks,
          brand: vendor,
          price: {
            amountMicros: originalPriceMicros,
            currencyCode: currencyCode,
          },
          availability: availability,
          condition: "NEW",
          googleProductCategory: googleProductCategory,
          gender: gender,
          ageGroup: "ADULT",
          itemGroupId: data.id.toString().split("/").pop()?.replace(/\D/g, ""),
          material: material || undefined,
          sizeSystem: "EU",
          sizeType: "regular",
          productTypes: [data.productType || data.product_type].filter(Boolean),
          productHighlights: productHighlights,
          shipping: [
            {
              country: "UA",
              price: {
                amountMicros: "0",
                currencyCode: "UAH",
              },
            },
          ],
        },
      };

      if (hasSale) {
        productInput.productAttributes.salePrice = {
          amountMicros: finalPriceMicros,
          currencyCode: currencyCode,
        };
      }

      if (colorOpt) productInput.productAttributes.color = colorOpt.value;
      if (sizeOpt) productInput.productAttributes.size = sizeOpt.value;

      if (discount > 0) {
        productInput.productAttributes.customLabel0 = `discount_${discount}%`;
      }

      const result = await insertProduct(productInput);
      console.log(`[Worker] API Response for ${offerId}`);
    }
  } catch (error: any) {
    console.error(`[Worker Error] Failed to process product:`, error);
    throw error;
  }
}
