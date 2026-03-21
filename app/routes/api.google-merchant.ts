import { googleMerchantSyncQueue } from "@/service/sync/queues";
import { prisma } from "@shared/lib/prisma/prisma.server";
import { client } from "@shared/lib/shopify/client/client";
import type { LoaderFunctionArgs } from "react-router";

export const DISCOUNT_METAFIELD_KEY = "znizka";

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
                quantityAvailable
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

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const session = await prisma.session.findFirst({
    select: { shop: true, accessToken: true },
  });

  if (!session?.accessToken || !session.shop) {
    return Response.json(
      { error: "No Shopify session found" },
      { status: 503 },
    );
  }

  let hasNextPage = true;
  let cursor: string | null = null;
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.miomio.com.ua";
  let productCount = 0;

  try {
    while (hasNextPage) {
      const response: any = await client.request({
        query: GET_PRODUCTS_FOR_GOOGLE_FEED,
        variables: { first: 50, after: cursor },
        accessToken: session.accessToken,
        shopDomain: session.shop,
      });

      if (!response.products?.edges) break;

      for (const edge of response.products.edges) {
        const product = edge.node;
        
        // Add job for product (worker handles both locales)
        const numericId = product.id.split("/").pop();
        await googleMerchantSyncQueue.add(`sync-${product.handle}`, {
          product,
          baseUrl,
        }, {
          jobId: `${numericId}${Date.now()}`,
          removeOnComplete: true,
        });
        productCount++;
      }

      hasNextPage = response.products.pageInfo.hasNextPage;
      cursor = response.products.pageInfo.endCursor;
    }

    return Response.json({ success: true, queuedProducts: productCount });
  } catch (error: any) {
    console.error("Sync error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
};
