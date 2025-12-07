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
   #graphql
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

export const syncCollections = async (admin: AdminApiContext) => {
  try {
    const allExistingCollections = await getCollections();
    if (!allExistingCollections) {
      console.log("No collections found to sync.");
      return;
    }
    const groupedCollections = groupCollectionsByCategoryId(
      allExistingCollections,
    );
    let shopifyCollectionId;
    for (const [categoryId, { ukr, rus }] of groupedCollections.entries()) {
      if (ukr) {
        console.log("Processing collection description: ukr ", categoryId);
        const baseInput: CollectionInput = {
          title: ukr.name,
          handle: ukr.seo_keyword || undefined,
          descriptionHtml: ukr.description,
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
            description: ukr.meta_description,
          },
        };
        const createResponse = await admin.graphql(COLLECTION_CREATE_MUTATION, {
          variables: { input: baseInput },
        });

        if (!createResponse.ok) {
          console.error(
            `Помилка мережі при створенні колекції ${categoryId}:`,
            createResponse.statusText,
          );
          continue;
        }

        const creationResult: { data?: CollectionCreateMutation } =
          await createResponse.json();

        if (creationResult.data?.collectionCreate?.userErrors?.length) {
          console.error(
            `Помилка створення колекції ${categoryId}:`,
            creationResult.data.collectionCreate.userErrors,
          );
          continue;
        }

        shopifyCollectionId =
          creationResult.data!.collectionCreate!.collection!.id;
        console.log(
          `Колекція ${categoryId} створена з ID: ${shopifyCollectionId}`,
        );
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
          console.error(
            `Помилка мережі при отриманні дайджестів для ${categoryId}:`,
            digestResponse.statusText,
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
        ];

        for (const { shopifyKey, sourceField } of fieldMap) {
          const digestEntry = digests.find((d) => d.key === shopifyKey);
          const sourceValue = rus[sourceField];
          if (digestEntry && typeof sourceValue === "string" && sourceValue) {
            translationsToRegister.push({
              locale: "ru",
              key: shopifyKey,
              value: sourceValue,
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
            console.error(
              `Помилка мережі при реєстрації перекладу для ${categoryId}:`,
              registerResponse.statusText,
            );
            continue;
          }

          const registerResult: { data?: TranslationsRegisterMutation } =
            await registerResponse.json();

          if (registerResult.data?.translationsRegister?.userErrors?.length) {
            console.error(
              `Помилка перекладу колекції ${categoryId}:`,
              registerResult.data.translationsRegister.userErrors,
            );
          } else {
            console.log(
              `Переклад для колекції ${categoryId} (ru) успішно зареєстровано.`,
            );
          }
        }
      }
    }
  } catch (err: any) {
    console.error("Помилка синхронізації колекцій:", err);
    throw new Error(`Помилка синхронізації колекцій: ${err.message}`);
  }
};
