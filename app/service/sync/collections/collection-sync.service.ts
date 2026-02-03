
import { prisma } from "@shared/lib/prisma/prisma.server";
import { sanityClient } from "@shared/lib/sanity/client";
import { client } from "@shared/lib/shopify/client/client";
import { v5 as uuidv5 } from "uuid";

// UUID namespace for generating rule keys
const RULE_KEY_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

interface CollectionTranslation {
  locale: string;
  key: string;
  value: string;
}

interface CollectionRule {
  column: string;
  condition: string;
  relation: string;
}

interface ShopifyCollection {
  id: string;
  handle: string;
  title: string;
  descriptionHtml: string;
  image?: {
    url: string;
    altText?: string;
    width?: number;
    height?: number;
  };
  seo: {
    title?: string;
    description?: string;
  };
  sortOrder: string;
  ruleSet?: {
    appliedDisjunctively: boolean;
    rules: CollectionRule[];
  };
  updatedAt: string;
}

interface CollectionQueryResponse {
  collection: ShopifyCollection | null;
}

interface TranslationsQueryResponse {
  translatableResource: {
    translations: CollectionTranslation[];
  } | null;
}

const GET_COLLECTION_QUERY = `
  query getCollection($id: ID!) {
    collection(id: $id) {
      id
      handle
      title
      descriptionHtml
      image {
        url
        altText
        width
        height
      }
      seo {
        title
        description
      }
      sortOrder
      ruleSet {
        appliedDisjunctively
        rules {
          column
          condition
          relation
        }
      }
      updatedAt
    }
  }
`;

const GET_TRANSLATIONS_QUERY = `
  query getTranslations($resourceId: ID!, $locale: String!) {
    translatableResource(resourceId: $resourceId) {
      translations(locale: $locale) {
        locale
        key
        value
      }
    }
  }
`;

const GET_SHOP_LOCALES_QUERY = `
  query getShopLocales {
    shopLocales {
      locale
      name
      primary
      published
    }
  }
`;

const GET_TRANSLATABLE_CONTENT_QUERY = `
  query getTranslatableContent($resourceId: ID!) {
    translatableResource(resourceId: $resourceId) {
      resourceId
      translatableContent {
        key
        value
        digest
        locale
      }
    }
  }
`;

interface ShopLocale {
  locale: string;
  name: string;
  primary: boolean;
  published: boolean;
}

interface ShopLocalesResponse {
  shopLocales: ShopLocale[];
}

interface TranslatableContent {
  key: string;
  value: string;
  digest: string;
  locale: string;
}

interface TranslatableContentResponse {
  translatableResource: {
    resourceId: string;
    translatableContent: TranslatableContent[];
  } | null;
}

async function getAccessToken(shop: string): Promise<string> {
  const session = await prisma.session.findFirst({
    where: { shop },
    select: { accessToken: true },
  });

  if (!session?.accessToken) {
    throw new Error(`No access token found for shop: ${shop}`);
  }

  return session.accessToken;
}

async function fetchCollection(
  shopDomain: string,
  accessToken: string,
  collectionId: number
): Promise<ShopifyCollection | null> {
  const gid = `gid://shopify/Collection/${collectionId}`;

  const response = await client.request<CollectionQueryResponse, { id: string }>(
    {
      query: GET_COLLECTION_QUERY,
      variables: { id: gid },
      accessToken,
      shopDomain,
    }
  );

  return response.collection;
}

async function fetchShopLocales(
  shopDomain: string,
  accessToken: string
): Promise<ShopLocale[]> {
  const response = await client.request<ShopLocalesResponse, object>({
    query: GET_SHOP_LOCALES_QUERY,
    variables: {},
    accessToken,
    shopDomain,
  });

  return response.shopLocales || [];
}

async function fetchTranslatableContent(
  shopDomain: string,
  accessToken: string,
  resourceId: string
): Promise<TranslatableContent[]> {
  const response = await client.request<
    TranslatableContentResponse,
    { resourceId: string }
  >({
    query: GET_TRANSLATABLE_CONTENT_QUERY,
    variables: { resourceId },
    accessToken,
    shopDomain,
  });

  return response.translatableResource?.translatableContent || [];
}

async function fetchTranslations(
  shopDomain: string,
  accessToken: string,
  collectionGid: string,
  locale: string
): Promise<CollectionTranslation[]> {
  const response = await client.request<
    TranslationsQueryResponse,
    { resourceId: string; locale: string }
  >({
    query: GET_TRANSLATIONS_QUERY,
    variables: { resourceId: collectionGid, locale },
    accessToken,
    shopDomain,
  });

  return response.translatableResource?.translations || [];
}

function generateRuleKey(
  collectionId: string,
  rule: CollectionRule
): string {
  const keySource = `${collectionId}-${rule.column}-${rule.condition}-${rule.relation}`;
  return uuidv5(keySource, RULE_KEY_NAMESPACE);
}

function normalizeSortOrder(sortOrder: string): string {
  return sortOrder.toUpperCase().replace(/-/g, "_");
}

function buildSanityDocument(
  collection: ShopifyCollection,
  ukTranslations: CollectionTranslation[],
  ruTranslations: CollectionTranslation[]
) {
  const getTranslationValue = (
    translations: CollectionTranslation[],
    key: string
  ): string | undefined => {
    return translations.find((t) => t.key === key)?.value;
  };

  // Extract numeric ID from GID
  const numericId = collection.id.split("/").pop() || "0";

  // Build rules with UUID keys
  const rules = collection.ruleSet?.rules.map((rule) => ({
    _key: generateRuleKey(collection.id, rule),
    _type: "collectionRule",
    column: rule.column,
    condition: rule.condition,
    relation: rule.relation,
  })) || [];

  return {
    _id: `shopifyCollection-${numericId}`,
    _type: "collection",
    store: {
      id: parseInt(numericId),
      gid: collection.id,
      title: collection.title,
      slug: {
        _type: "slug",
        current: collection.handle,
      },
      descriptionHtml: collection.descriptionHtml,
      imageUrl: collection.image?.url || null,
      sortOrder: normalizeSortOrder(collection.sortOrder),
      rules,
      disjunctive: collection.ruleSet?.appliedDisjunctively || false,
      isDeleted: false,
      updatedAt: collection.updatedAt,
    },
    // Localized handles for uk/ru
    handles: {
      uk: getTranslationValue(ukTranslations, "handle") || collection.handle,
      ru: getTranslationValue(ruTranslations, "handle") || collection.handle,
    },
    // Localized titles for uk/ru
    titles: {
      uk: getTranslationValue(ukTranslations, "title") || collection.title,
      ru: getTranslationValue(ruTranslations, "title") || collection.title,
    },
    // Localized descriptions for uk/ru
    descriptions: {
      uk:
        getTranslationValue(ukTranslations, "body_html") ||
        collection.descriptionHtml,
      ru:
        getTranslationValue(ruTranslations, "body_html") ||
        collection.descriptionHtml,
    },
  };
}

export async function syncCollectionToSanity(
  shop: string,
  collectionId: number
): Promise<void> {
  console.log(`Syncing collection ${collectionId} from ${shop} to Sanity`);

  const accessToken = await getAccessToken(shop);

  // Fetch available locales for debugging (optional, may fail without read_locales scope)
  let shopLocales: ShopLocale[] = [];
  try {
    shopLocales = await fetchShopLocales(shop, accessToken);
    console.log(`Available shop locales:`, shopLocales);
  } catch (error) {
    console.warn(`Could not fetch shop locales (need read_locales scope):`, error);
  }

  // Fetch collection from Shopify
  const collection = await fetchCollection(shop, accessToken, collectionId);

  if (!collection) {
    console.warn(`Collection ${collectionId} not found in Shopify`);
    return;
  }

  // Fetch translatable content for debugging
  let translatableContent: TranslatableContent[] = [];
  try {
    translatableContent = await fetchTranslatableContent(
      shop,
      accessToken,
      collection.id
    );
    console.log(`Translatable content for collection:`, translatableContent);
  } catch (error) {
    console.warn(`Could not fetch translatable content:`, error);
  }

  // Find the correct locale codes from shop locales
  const ukLocale = shopLocales.find(
    (l) => l.locale.startsWith("uk") || l.name.toLowerCase().includes("ukrain")
  );
  const ruLocale = shopLocales.find(
    (l) => l.locale.startsWith("ru") || l.name.toLowerCase().includes("russian")
  );

  console.log(`UK locale found:`, ukLocale);
  console.log(`RU locale found:`, ruLocale);

  // Fetch translations for UK and RU using detected locale codes
  const [ukTranslations, ruTranslations] = await Promise.all([
    fetchTranslations(shop, accessToken, collection.id, ukLocale?.locale || "uk"),
    fetchTranslations(shop, accessToken, collection.id, ruLocale?.locale || "ru"),
  ]);

  console.log(`UK translations (${ukLocale?.locale || "uk"}):`, ukTranslations);
  console.log(`RU translations (${ruLocale?.locale || "ru"}):`, ruTranslations);

  // Build Sanity document
  const sanityDocument = buildSanityDocument(
    collection,
    ukTranslations,
    ruTranslations
  );

  // Upsert to Sanity
  await sanityClient.createOrReplace(sanityDocument);

  console.log(
    `Successfully synced collection ${collectionId} to Sanity as ${sanityDocument._id}`
  );
}

export async function deleteCollectionFromSanity(
  collectionId: number
): Promise<void> {
  const documentId = `shopifyCollection-${collectionId}`;

  console.log(`Deleting collection ${documentId} from Sanity`);

  // Mark as deleted instead of hard delete
  try {
    await sanityClient
      .patch(documentId)
      .set({ "store.isDeleted": true })
      .commit();
    console.log(`Marked collection ${documentId} as deleted in Sanity`);
  } catch (error) {
    // Document might not exist, try to delete anyway
    console.log(`Collection ${documentId} might not exist, attempting delete`);
    try {
      await sanityClient.delete(documentId);
    } catch {
      console.log(`Collection ${documentId} does not exist in Sanity`);
    }
  }
}
