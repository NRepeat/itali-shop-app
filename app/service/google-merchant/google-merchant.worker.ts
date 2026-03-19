import { insertProduct, deleteProduct } from "./client";
import { Job } from "bullmq";
import { client as shopifyClient } from "@shared/lib/shopify/client/client";
import { prisma } from "@shared/lib/prisma/prisma.server";

export const googleMerchantQueueName = "googleMerchantSyncQueue";

const IGNORED_HIGHLIGHT_VALUES = new Set([
  "new", 
  "sale", 
  "available", 
  "instock", 
  "winter w", 
  "summer w", 
  "fw", 
  "ss"
]);

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

export async function processGoogleMerchantTask(job: Job) {
  try {
    const { product, payload, locale, baseUrl: jobBaseUrl, topic, shop } = job.data;
    const baseUrl = jobBaseUrl || process.env.NEXT_PUBLIC_SITE_URL || "https://www.miomio.com.ua";

    if (!locale) {
      console.log(`[Worker] Splitting task for product ${product?.handle || 'unknown'} into ru and uk locales`);
      const locales = ["ru", "uk"];
      for (const l of locales) {
        await processGoogleMerchantTask({
          ...job,
          data: { ...job.data, locale: l, baseUrl }
        } as any);
      }
      return;
    }

    const data = payload || product;
    const isDelete = topic === "products/delete" || job.data.action === "delete";

    if (!data) {
      console.error("[Worker] No data found in job payload");
      return;
    }

    // Get session for translations
    const session = await prisma.session.findFirst({
      where: shop ? { shop } : {},
      select: { shop: true, accessToken: true },
    });

    const fetchTranslation = async (resourceId: string, locale: string, key: string) => {
      if (!session || locale === "uk") return null; // Default is UK
      try {
        const res: any = await shopifyClient.request({
          query: GET_TRANSLATIONS_QUERY,
          variables: { id: resourceId, locale },
          accessToken: session.accessToken,
          shopDomain: session.shop,
        });
        return res.translatableResource?.translations?.find((t: any) => t.key === key)?.value;
      } catch (e) {
        return null;
      }
    };

    const handle = data.handle;
    console.log(`[Worker] Starting ${isDelete ? 'delete' : 'sync'} for: ${handle} (${locale})`);

    // Нормализация метафилдов и РАЗРЕШЕНИЕ метаобъектов
    const isUk = locale === "uk";
    
    const metafields = await Promise.all((data.metafields?.edges || []).map(async (e: any) => {
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
        const values = await Promise.all(node.references.nodes.map((ref: any) => resolveMetaobjectValue(ref)));
        displayValue = values.filter(Boolean).join(", ");
      } 
      else if (node.reference) {
        displayValue = await resolveMetaobjectValue(node.reference);
      }

      return { key: node.key, value: displayValue };
    }));

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
    // const collection = getMetafield("kolektsiya");

    if (material) rawHighlights.push(isUk ? `Матеріал: ${material}` : `Материал: ${material}`);
    if (lining) rawHighlights.push(isUk ? `Підкладка: ${lining}` : `Подкладка: ${lining}`);
    if (sole) rawHighlights.push(isUk ? `Підошва: ${sole}` : `Подошва: ${sole}`);
    if (season) rawHighlights.push(isUk ? `Сезон: ${season}` : `Сезон: ${season}`);
    // if (collection) rawHighlights.push(isUk ? `Колекція: ${collection}` : `Коллекция: ${collection}`);
    
    rawHighlights.push(isUk ? "Безкоштовна доставка по Україні" : "Бесплатная доставка по Украине");
    rawHighlights.push(isUk ? "Оригінальна італійська якість" : "Оригинальное итальянское качество");

    // Добавляем теги
    if (Array.isArray(data.tags)) {
      rawHighlights.push(...data.tags);
    }

    // ФИЛЬТРАЦИЯ МУСОРА и УМНАЯ ДЕДУПЛИКАЦИЯ в Highlights
    const uniqueHighlights = Array.from(new Set(rawHighlights));
    const productHighlights = uniqueHighlights
      .filter(h => {
        const val = h.toLowerCase().trim();
        const isTooShort = h.length < 4;
        const isNumeric = /^\d+$/.test(h);
        const isIgnored = IGNORED_HIGHLIGHT_VALUES.has(val);
        const isTechnical = val.includes("::");
        
        if (isTooShort || isNumeric || isIgnored || isTechnical) return false;

        // Проверяем, не является ли этот хайлайт частью другого (более длинного) хайлайта
        const isDuplicateOfLonger = uniqueHighlights.some(other => 
          other !== h && other.toLowerCase().includes(val)
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

    const vendor = data.vendor || "MioMio";
    const productTranslations = isUk ? (data.uk_translations || []) : (data.ru_translations || []);
    const getTranslatedValue = (key: string, defaultVal: string) => {
      return productTranslations.find((t: any) => t.key === key)?.value || defaultVal;
    };
    const title = getTranslatedValue("title", data.title);
    const description = (getTranslatedValue("body_html", data.description || data.body_html || title || "")).replace(/<[^>]*>?/gm, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

    // Универсальный парсинг картинок (GraphQL или REST)
    let allImages: string[] = [];
    if (data.images?.edges) {
      allImages = data.images.edges.map((e: any) => e.node.url || e.node.src).filter(Boolean);
    } else if (Array.isArray(data.images)) {
      allImages = data.images.map((img: any) => img.src || img.url).filter(Boolean);
    }

    for (const variant of variants) {
      const variantId = variant.id.toString().split("/").pop()?.replace(/\D/g, "");
      if (!variantId) continue;

      const offerId = variantId;

      if (isDelete) {
        await deleteProduct(offerId, locale, "UA");
        continue;
      }

      const options = variant.selectedOptions || [
        { name: "Option1", value: variant.option1 },
        { name: "Option2", value: variant.option2 },
        { name: "Option3", value: variant.option3 },
      ].filter((o: any) => o.value);

      const colorOpt = options.find((o: any) => ["color", "колір", "цвет"].includes(o.name.toLowerCase()));
      const sizeOpt = options.find((o: any) => ["size", "розмір", "размер"].includes(o.name.toLowerCase()));

      const priceAmount = parseFloat(variant.price?.amount || variant.price || "0");
      const compareAtPriceAmount = variant.compareAtPrice?.amount ? parseFloat(variant.compareAtPrice.amount) : (variant.compare_at_price ? parseFloat(variant.compare_at_price) : null);
      const currencyCode = variant.price?.currencyCode || "UAH";
      
      const amountMicros = Math.round(priceAmount * 1000000).toString();
      const availability = (variant.availableForSale ?? (variant.inventory_management ? (variant.inventory_quantity > 0) : true)) ? "IN_STOCK" : "OUT_OF_STOCK";
      
      const gender = (handle.includes("cholov") || handle.includes("man") || handle.includes("men")) ? "MALE" : (handle.includes("zhinoch") || handle.includes("woman") || handle.includes("women")) ? "FEMALE" : "UNISEX";
      const mainImageLink = variant.image?.url || variant.image_url || data.featuredImage?.url || allImages[0] || "";
      const additionalImageLinks = allImages.filter((url: string) => url !== mainImageLink).slice(0, 10);

      // Формируем ссылку с параметром size, если он есть
      const productLink = `${baseUrl}/${locale}/product/${handle}${sizeOpt ? `?size=${encodeURIComponent(sizeOpt.value)}` : ""}`;

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
            amountMicros: amountMicros, 
            currencyCode: currencyCode,
          },
          availability: availability,
          condition: "NEW",
          googleProductCategory: "3032",
          gender: gender,
          ageGroup: "ADULT",
          itemGroupId: data.id.toString().split("/").pop()?.replace(/\D/g, ""),
          material: material || undefined,
          sizeSystem: "EU",
          sizeType: "regular",
          productTypes: [data.productType || data.product_type].filter(Boolean),
          productHighlights: productHighlights,
          shipping: [{
              country: "UA",
              price: {
                  amountMicros: "0",
                  currencyCode: "UAH"
              }
          }]
        },
      };

      if (colorOpt) productInput.productAttributes.color = colorOpt.value;
      if (sizeOpt) productInput.productAttributes.size = sizeOpt.value;
      
      if (discount > 0) {
         productInput.productAttributes.customLabel0 = `discount_${discount}%`;
      }

      if (compareAtPriceAmount && compareAtPriceAmount > priceAmount) {
         productInput.productAttributes.price = {
            amountMicros: Math.round(compareAtPriceAmount * 1000000).toString(),
            currencyCode: currencyCode,
         };
         productInput.productAttributes.salePrice = {
            amountMicros: amountMicros,
            currencyCode: currencyCode,
         };
      }

      console.log(`[Worker] Final Attributes for ${offerId} (${locale}):`, JSON.stringify(productInput.productAttributes, null, 2));
      const result = await insertProduct(productInput);
      console.log(`[Worker] API Response for ${offerId}:`, JSON.stringify(result, null, 2));
    }
  } catch (error: any) {
    console.error(`[Worker Error] Failed to process product:`, error);
    throw error;
  }
}
