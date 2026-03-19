import { googleMerchantSyncQueue } from "../app/service/sync/queues";
import { prisma } from "../app/shared/lib/prisma/prisma.server";
import { client } from "../app/shared/lib/shopify/client/client";

const DISCOUNT_METAFIELD_KEY = "znizka";
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
              displayName
              field(key: "label") { value }
            }
          }
          references(first: 10) {
            nodes {
              ... on Metaobject {
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

const GET_PRODUCT_BY_HANDLE = `#graphql
  ${PRODUCT_METAFIELDS_FRAGMENT}
  query GetProductByHandle($handle: String!) {
    productByHandle(handle: $handle) {
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

const GET_PRODUCTS_FOR_GOOGLE_FEED = `#graphql
  ${PRODUCT_METAFIELDS_FRAGMENT}
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
          tags
          uk_translations: translations(locale: "uk") { key value }
          ru_translations: translations(locale: "ru") { key value }
          featuredImage {

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

async function main() {
  const handle = process.argv[2];
  if (!handle) {
    console.error("Please provide a product handle: npx tsx scripts/google-merchant-test.ts <product-handle>");
    process.exit(1);
  }

  const session = await prisma.session.findFirst({
    select: { shop: true, accessToken: true },
  });

  if (!session?.accessToken || !session.shop) {
    console.error("No Shopify session found in database");
    process.exit(1);
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.miomio.com.ua";

  console.log(`Fetching product: ${handle} from shop: ${session.shop}`);

  try {
    const response: any = await client.request({
      query: GET_PRODUCT_BY_HANDLE,
      variables: { handle },
      accessToken: session.accessToken,
      shopDomain: session.shop,
    });

    const product = response.productByHandle;
    if (!product) {
      console.error(`Product not found for handle: ${handle}`);
      process.exit(1);
    }

    console.log(`Queuing product: ${product.title} for Google Merchant sync...`);

    const numericId = product.id.split("/").pop();
    await googleMerchantSyncQueue.add(`sync-test-${product.handle}`, {
      product,
      baseUrl,
    }, {
      jobId: `${numericId}${Date.now()}`,
      removeOnComplete: true,
    });

    console.log(`Test job added to queue. Check your worker output.`);
    process.exit(0);
  } catch (error: any) {
    console.error("Sync error:", error);
    process.exit(1);
  }
}

main();
