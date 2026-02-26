import { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import {
  CollectionCreateMutation,
  CollectionInput,
  CollectionRuleColumn,
  CollectionRuleRelation,
  TranslatableResourceQuery,
  TranslationInput,
  TranslationsRegisterMutation,
} from "@/types";
import {
  getCollections,
  ExistingCollection,
} from "@/service/italy/collections/getCollections";
import { bc_category_description } from "~/prisma/generated/external_client/client";
import {
  getBrands,
  ExistingBrand,
} from "@/service/italy/collections/getBrands";

// --- GraphQL Мутації та Запити (Текст) ---

// 1. Створення Колекції
const COLLECTION_CREATE_MUTATION = `
  #graphql
  mutation collectionCreate($input: CollectionInput!) {
    collectionCreate(input: $input) {
      collection {
        id
        handle
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// 2. Отримання Дайджестів Контенту
const GET_TRANSLATABLE_RESOURCE_QUERY = `
   #graphql
   query translatableResource($id: ID!) {
       translatableResource(resourceId: $id) {
         translatableContent {
           key
           digest # Використовуйте 'digest' замість 'translatableContentDigest'
           value
         }
       }
     }
`;

// 3. Реєстрація Перекладів
const TRANSLATIONS_REGISTER_MUTATION = `

  mutation translationsRegister($resourceId: ID!, $translations: [TranslationInput!]!) {
    translationsRegister(resourceId: $resourceId, translations: $translations) {
      translations {
        locale
        key
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// --- Допоміжні Функції ---

const decodeHtml = (str: string): string =>
  str
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'");

// --- Допоміжні Типи та Функції ---

type ExistingCollectionDescription = NonNullable<
  ExistingCollection["description"]
>;

// Групує вхідні об'єкти за category_id і розділяє їх за language_id
const groupCollectionsByCategoryId = (collections: ExistingCollection[]) => {
  const grouped = new Map<
    number,
    {
      ukr?: ExistingCollectionDescription["ukr"];
      rus?: ExistingCollectionDescription["rus"];
    }
  >();

  for (const collection of collections) {
    if (!collection.description) continue;
    const categoryId = collection.category_id;
    if (!grouped.has(categoryId)) {
      grouped.set(categoryId, {});
    }

    // Припустимо: 3 = UKR, 1 = RUS

    if (collection.description.ukr) {
      console.log(
        "Processing collection description: ukr",
        collection.description.ukr,
      );
      grouped.get(categoryId)!.ukr = collection.description.ukr;
    }
    if (collection.description.rus) {
      console.log(
        "Processing collection description: rus ",
        collection.description.rus,
      );
      grouped.get(categoryId)!.rus = collection.description.rus;
    }
  }
  return grouped;
};
const GENDER_SLUGS = ["zhinochi", "cholovichi", "dityachi", "uniseks"];

export function stripGenderFromHandle(handle: string): string {
  return handle
    .split("-")
    .filter((part) => !GENDER_SLUGS.includes(part))
    .join("-");
}
export const syncCollections = async (admin: AdminApiContext) => {
  const logs: string[] = [];
  const log = (msg: string) => {
    console.log(msg);
    logs.push(msg);
  };
  try {
    const allExistingCollections = await getCollections();
    if (!allExistingCollections) {
      log("No collections found to sync.");
      return logs;
    }
    const groupedCollections = groupCollectionsByCategoryId(
      allExistingCollections,
    );
    log(`Found ${groupedCollections.size} categories to sync`);
    let shopifyCollectionId;
    for (const [categoryId, { ukr, rus }] of groupedCollections.entries()) {
      if (ukr) {
        log(`Creating category collection: ${ukr.name} (id: ${categoryId})`);
        const baseInput: CollectionInput = {
          title: ukr.name,
          // handle: ukr.seo_keyword
          //   ? stripGenderFromHandle(ukr.seo_keyword)
          //   : undefined,
           handle: ukr.seo_keyword
            ? ukr.seo_keyword
            : undefined,
          descriptionHtml: decodeHtml(ukr.description),
          ruleSet: {
            appliedDisjunctively: true,
            rules: [
              {
                column: "TAG" as CollectionRuleColumn.Tag,
                relation: "EQUALS" as CollectionRuleRelation.Equals,
                condition: ukr.name,
              },
            ],
          },
          seo: {
            title: ukr.meta_title,
            description: decodeHtml(ukr.meta_description),
          },
        };
        const createResponse = await admin.graphql(COLLECTION_CREATE_MUTATION, {
          variables: { input: baseInput },
        });

        if (!createResponse.ok) {
          log(
            `Error creating collection ${categoryId}: ${createResponse.statusText}`,
          );
          continue;
        }

        const creationResult: { data?: CollectionCreateMutation } =
          await createResponse.json();

        if (creationResult.data?.collectionCreate?.userErrors?.length) {
          log(
            `Error creating collection ${categoryId}: ${JSON.stringify(creationResult.data.collectionCreate.userErrors)}`,
          );
          continue;
        }

        shopifyCollectionId =
          creationResult.data!.collectionCreate!.collection!.id;
        log(`Collection ${categoryId} created with ID: ${shopifyCollectionId}`);
      }

      if (rus && shopifyCollectionId) {
        const digestResponse = await admin.graphql(
          GET_TRANSLATABLE_RESOURCE_QUERY,
          {
            variables: {
              id: shopifyCollectionId,
            },
          },
        );

        if (!digestResponse.ok) {
          log(
            `Error fetching digests for ${categoryId}: ${digestResponse.statusText}`,
          );
          continue;
        }

        const digestResult: { data?: TranslatableResourceQuery } =
          await digestResponse.json();

        const translationsToRegister: TranslationInput[] = [];
        const digests =
          digestResult.data?.translatableResource?.translatableContent || [];

        // 2B. Формування об'єктів перекладу

        const fieldMap: {
          shopifyKey: string;
          sourceField: keyof ExistingCollectionDescription;
        }[] = [
          { shopifyKey: "title", sourceField: "name" },
          { shopifyKey: "body_html", sourceField: "description" },
          { shopifyKey: "meta_title", sourceField: "meta_title" },
          { shopifyKey: "meta_description", sourceField: "meta_description" },
          { shopifyKey: "handle", sourceField: "seo_keyword" },
        ];

        for (const { shopifyKey, sourceField } of fieldMap) {
          const digestEntry = digests.find((d) => d.key === shopifyKey);
          const sourceValue = rus[sourceField];
          if (digestEntry && typeof sourceValue === "string" && sourceValue) {
            const decoded =
              shopifyKey === "body_html" || shopifyKey === "meta_description"
                ? decodeHtml(sourceValue)
                : sourceValue;
            translationsToRegister.push({
              locale: "ru",
              key: shopifyKey,
              value: decoded,
              translatableContentDigest: digestEntry.digest!,
            });
          }
        }

        if (translationsToRegister.length > 0) {
          const registerResponse = await admin.graphql(
            TRANSLATIONS_REGISTER_MUTATION,
            {
              variables: {
                resourceId: shopifyCollectionId,
                translations: translationsToRegister,
              },
            },
          );

          if (!registerResponse.ok) {
            log(
              `Error registering translation for ${categoryId}: ${registerResponse.statusText}`,
            );
            continue;
          }

          const registerResult: { data?: TranslationsRegisterMutation } =
            await registerResponse.json();

          if (registerResult.data?.translationsRegister?.userErrors?.length) {
            log(
              `Translation error for collection ${categoryId}: ${JSON.stringify(registerResult.data.translationsRegister.userErrors)}`,
            );
          } else {
            log(
              `Translation for collection ${categoryId} (ru) registered successfully`,
            );
          }
        }
      }
    }
    log("Category sync completed");
    return logs;
  } catch (err: any) {
    logs.push(`Error: ${err.message}`);
    throw Object.assign(
      new Error(`Помилка синхронізації колекцій: ${err.message}`),
      { logs },
    );
  }
};

// 4. Fetch All Shopify Collections (paginated)
const GET_SHOPIFY_COLLECTIONS_QUERY = `
  #graphql
  query getShopifyCollections($first: Int!, $after: String) {
    collections(first: $first, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        handle
        title
      }
    }
  }
`;

// Translate all existing Shopify collections to Russian using Italy source data
export const translateExistingCollections = async (admin: AdminApiContext) => {
  const logs: string[] = [];
  const log = (msg: string) => {
    console.log(msg);
    logs.push(msg);
  };

  try {
    const allExistingCollections = await getCollections();
    if (!allExistingCollections) {
      log("No collections found from Italy source.");
      return logs;
    }

    // Build maps: ukr seo_keyword (normalized) → rus, ukr name → rus (fallback)
    const groupedCollections = groupCollectionsByCategoryId(
      allExistingCollections,
    );
    const handleToRus = new Map<string, NonNullable<bc_category_description>>();
    const titleToRus = new Map<string, NonNullable<bc_category_description>>();
    for (const { ukr, rus } of groupedCollections.values()) {
      if (!rus) continue;
      // Shopify normalizes handles to lowercase — match the same way
      if (ukr?.seo_keyword) {
        handleToRus.set(ukr.seo_keyword.toLowerCase(), rus);
      }
      // Fallback: match by Ukrainian title (for collections where seo_keyword was empty)
      if (ukr?.name) {
        titleToRus.set(ukr.name.toLowerCase(), rus);
      }
    }
    log(`Built maps: ${handleToRus.size} by handle, ${titleToRus.size} by title`);

    // Paginate through all Shopify collections
    let hasNextPage = true;
    let cursor: string | null = null;
    let translated = 0;

    while (hasNextPage) {
      const listResponse = await admin.graphql(GET_SHOPIFY_COLLECTIONS_QUERY, {
        variables: { first: 50, after: cursor },
      });

      if (!listResponse.ok) {
        log(
          `Error fetching Shopify collections: ${listResponse.statusText}`,
        );
        break;
      }

      const listResult = await listResponse.json();
      const page = listResult.data?.collections;
      if (!page) break;

      hasNextPage = page.pageInfo.hasNextPage;
      cursor = page.pageInfo.endCursor ?? null;

      for (const collection of page.nodes as { id: string; handle: string; title: string }[]) {
        // Primary: match by handle (normalized lowercase)
        // Fallback: match by Ukrainian title (for collections where seo_keyword was empty)
        const rus =
          handleToRus.get(collection.handle.toLowerCase()) ??
          titleToRus.get(collection.title.toLowerCase());

        if (!rus) {
          log(`SKIP "${collection.handle}" (title: "${collection.title}") — no Russian data matched`);
          continue;
        }

        const digestResponse = await admin.graphql(
          GET_TRANSLATABLE_RESOURCE_QUERY,
          { variables: { id: collection.id } },
        );

        if (!digestResponse.ok) {
          log(
            `Error fetching digests for "${collection.handle}": ${digestResponse.statusText}`,
          );
          continue;
        }

        const digestResult: { data?: TranslatableResourceQuery } =
          await digestResponse.json();
        const digests =
          digestResult.data?.translatableResource?.translatableContent || [];

        const fieldsToTranslate: { shopifyKey: string; value: string | undefined }[] = [
          { shopifyKey: "title", value: rus.name },
          {
            shopifyKey: "body_html",
            value: rus.description ? decodeHtml(rus.description) : undefined,
          },
          { shopifyKey: "meta_title", value: rus.meta_title },
          {
            shopifyKey: "meta_description",
            value: rus.meta_description
              ? decodeHtml(rus.meta_description)
              : undefined,
          },
          { shopifyKey: "handle", value: rus.seo_keyword },
        ];

        const translationsToRegister: TranslationInput[] = [];
        for (const { shopifyKey, value } of fieldsToTranslate) {
          const digestEntry = digests.find((d) => d.key === shopifyKey);
          if (digestEntry && value) {
            translationsToRegister.push({
              locale: "ru",
              key: shopifyKey,
              value,
              translatableContentDigest: digestEntry.digest!,
            });
          }
        }

        if (translationsToRegister.length === 0) {
          log(`No translations to register for "${collection.handle}"`);
          continue;
        }

        const registerResponse = await admin.graphql(
          TRANSLATIONS_REGISTER_MUTATION,
          {
            variables: {
              resourceId: collection.id,
              translations: translationsToRegister,
            },
          },
        );

        if (!registerResponse.ok) {
          log(
            `Error registering translations for "${collection.handle}": ${registerResponse.statusText}`,
          );
          continue;
        }

        const registerResult: { data?: TranslationsRegisterMutation } =
          await registerResponse.json();

        if (registerResult.data?.translationsRegister?.userErrors?.length) {
          log(
            `Translation error for "${collection.handle}": ${JSON.stringify(registerResult.data.translationsRegister.userErrors)}`,
          );
        } else {
          log(
            `Translated "${collection.handle}" → ru (${translationsToRegister.length} fields)`,
          );
          translated++;
        }
      }
    }

    log(`Completed. Translated ${translated} collections.`);
    return logs;
  } catch (err: any) {
    logs.push(`Error: ${err.message}`);
    throw Object.assign(
      new Error(`Error translating collections: ${err.message}`),
      { logs },
    );
  }
};

export const syncBrandCollections = async (admin: AdminApiContext) => {
  const logs: string[] = [];
  const log = (msg: string) => {
    console.log(msg);
    logs.push(msg);
  };
  try {
    const brands = await getBrands();
    if (!brands.length) {
      log("No brands found to sync.");
      return logs;
    }
    log(`Found ${brands.length} brands to sync`);

    for (const [i, brand] of brands.entries()) {
      const ukr = brand.seo.ukr;
      const rus = brand.seo.rus;

      const title = ukr?.name || brand.name;
      const descriptionHtml = decodeHtml(ukr?.description || "");
      const seoTitle = ukr?.meta_title || "";
      const seoDescription = decodeHtml(ukr?.meta_description || "");

      const baseInput: CollectionInput = {
        title,
        descriptionHtml,
        ruleSet: {
          appliedDisjunctively: false,
          rules: [
            {
              column: "VENDOR" as CollectionRuleColumn.Vendor,
              relation: "EQUALS" as CollectionRuleRelation.Equals,
              condition: brand.name,
            },
          ],
        },
        seo: {
          title: seoTitle || undefined,
          description: seoDescription || undefined,
        },
      };

      const createResponse = await admin.graphql(COLLECTION_CREATE_MUTATION, {
        variables: { input: baseInput },
      });

      if (!createResponse.ok) {
        log(
          `[${i + 1}/${brands.length}] Error creating brand collection ${brand.name}: ${createResponse.statusText}`,
        );
        continue;
      }

      const creationResult: { data?: CollectionCreateMutation } =
        await createResponse.json();

      if (creationResult.data?.collectionCreate?.userErrors?.length) {
        log(
          `[${i + 1}/${brands.length}] Error creating brand collection ${brand.name}: ${JSON.stringify(creationResult.data.collectionCreate.userErrors)}`,
        );
        continue;
      }

      const shopifyCollectionId =
        creationResult.data!.collectionCreate!.collection!.id;
      log(
        `[${i + 1}/${brands.length}] Brand collection "${brand.name}" created with ID: ${shopifyCollectionId}`,
      );

      if (rus) {
        const digestResponse = await admin.graphql(
          GET_TRANSLATABLE_RESOURCE_QUERY,
          { variables: { id: shopifyCollectionId } },
        );

        if (!digestResponse.ok) {
          log(
            `Error fetching digests for brand ${brand.name}: ${digestResponse.statusText}`,
          );
          continue;
        }

        const digestResult: { data?: TranslatableResourceQuery } =
          await digestResponse.json();

        const translationsToRegister: TranslationInput[] = [];
        const digests =
          digestResult.data?.translatableResource?.translatableContent || [];

        const fieldMap: { shopifyKey: string; value: string | undefined }[] = [
          { shopifyKey: "title", value: rus.name },
          {
            shopifyKey: "body_html",
            value: rus.description ? decodeHtml(rus.description) : undefined,
          },
          { shopifyKey: "meta_title", value: rus.meta_title },
          {
            shopifyKey: "meta_description",
            value: rus.meta_description
              ? decodeHtml(rus.meta_description)
              : undefined,
          },
        ];

        for (const { shopifyKey, value } of fieldMap) {
          const digestEntry = digests.find((d) => d.key === shopifyKey);
          if (digestEntry && value) {
            translationsToRegister.push({
              locale: "ru",
              key: shopifyKey,
              value,
              translatableContentDigest: digestEntry.digest!,
            });
          }
        }

        if (translationsToRegister.length > 0) {
          const registerResponse = await admin.graphql(
            TRANSLATIONS_REGISTER_MUTATION,
            {
              variables: {
                resourceId: shopifyCollectionId,
                translations: translationsToRegister,
              },
            },
          );

          if (!registerResponse.ok) {
            log(
              `Error registering translation for brand ${brand.name}: ${registerResponse.statusText}`,
            );
            continue;
          }

          const registerResult: { data?: TranslationsRegisterMutation } =
            await registerResponse.json();

          if (registerResult.data?.translationsRegister?.userErrors?.length) {
            log(
              `Translation error for brand ${brand.name}: ${JSON.stringify(registerResult.data.translationsRegister.userErrors)}`,
            );
          } else {
            log(
              `Translation for brand "${brand.name}" (ru) registered successfully`,
            );
          }
        }
      }
    }
    log("Brand sync completed");
    return logs;
  } catch (err: any) {
    logs.push(`Error: ${err.message}`);
    throw Object.assign(
      new Error(`Помилка синхронізації бренд-колекцій: ${err.message}`),
      { logs },
    );
  }
};
