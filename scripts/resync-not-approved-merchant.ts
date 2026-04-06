/**
 * Fetch all disapproved products from Google Merchant Center,
 * delete them, and re-queue for a clean re-sync.
 *
 * Run: npx dotenv-cli -e .env -- tsx scripts/resync-not-approved-merchant.ts
 * Dry: npx dotenv-cli -e .env -- tsx scripts/resync-not-approved-merchant.ts --dry-run
 */

import { listProducts, deleteProduct } from "../app/service/google-merchant/client";
import { googleMerchantSyncQueue } from "../app/service/sync/queues";
import { prisma } from "../app/shared/lib/prisma/prisma.server";
import { client } from "../app/shared/lib/shopify/client/client";

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

const GET_PRODUCT_BY_ID = `#graphql
  ${PRODUCT_METAFIELDS_FRAGMENT}
  query GetProductById($id: ID!) {
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

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  if (DRY_RUN) console.log("=== DRY RUN MODE — no changes will be made ===\n");

  const session = await prisma.session.findFirst({
    select: { shop: true, accessToken: true },
  });

  if (!session?.accessToken || !session.shop) {
    console.error("No Shopify session found in database");
    process.exit(1);
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.miomio.com.ua";

  console.log("Fetching products from Google Merchant Center...");
  const products = await listProducts();
  console.log(`Found ${products.length} products total.`);

  // Collect disapproved offerIds grouped by Shopify product ID
  const disapproved: Array<{
    offerId: string;
    lang: string;
    label: string;
    issues: string[];
  }> = [];

  for (const product of products) {
    const status = product.productStatus;
    const offerId = product.offerId;
    const lang = product.contentLanguage;
    const label = product.feedLabel;

    const isDisapproved = status?.destinationStatuses?.some(
      (ds: any) => ds.status === "DISAPPROVED" || ds.status === "REJECTED",
    );
    const hasIssues = (status?.itemLevelIssues?.length || 0) > 0;

    if (isDisapproved || hasIssues) {
      const issues = (status?.itemLevelIssues || []).map(
        (i: any) => `${i.description} (${i.severity})`,
      );
      disapproved.push({ offerId, lang, label, issues });
    }
  }

  console.log(`\nFound ${disapproved.length} disapproved entries.\n`);

  if (disapproved.length === 0) {
    console.log("Nothing to resync.");
    process.exit(0);
  }

  // Extract unique Shopify product IDs from offerIds
  // offerId format: shopify_UA_9557639528738_49147989909794 or similar
  // We need the product numeric ID (3rd segment)
  const productIdsToResync = new Set<string>();

  for (const entry of disapproved) {
    console.log(`${DRY_RUN ? "[DRY] Would delete" : "Deleting"}: ${entry.offerId} (${entry.lang}~${entry.label})`);
    entry.issues.forEach((issue) => console.log(`   - ${issue}`));
    if (!DRY_RUN) await deleteProduct(entry.offerId, entry.lang, entry.label);

    // Parse Shopify product ID from offerId
    const parts = entry.offerId.split("_");
    if (parts.length >= 3) {
      productIdsToResync.add(parts[2]);
    }
  }

  console.log(`\nRe-syncing ${productIdsToResync.size} unique products to Google Merchant...\n`);

  let queued = 0;

  for (const numericId of productIdsToResync) {
    const shopifyGid = `gid://shopify/Product/${numericId}`;

    try {
      const response: any = await client.request({
        query: GET_PRODUCT_BY_ID,
        variables: { id: shopifyGid },
        accessToken: session.accessToken,
        shopDomain: session.shop,
      });

      const product = response.product;
      if (!product) {
        console.log(`Product ${numericId} not found in Shopify, skipping.`);
        continue;
      }

      if (!DRY_RUN) {
        await googleMerchantSyncQueue.add(`resync-${product.handle}`, {
          product,
          baseUrl,
        }, {
          jobId: `${numericId}${Date.now()}`,
          removeOnComplete: true,
        });
      }

      queued++;
      console.log(`${DRY_RUN ? "[DRY] Would queue" : "Queued"}: ${product.handle} (${queued}/${productIdsToResync.size})`);
    } catch (err: any) {
      console.error(`Failed to fetch/queue product ${numericId}: ${err.message}`);
    }
  }

  console.log(`\n${DRY_RUN ? "[DRY RUN] Would have deleted" : "Deleted"} ${disapproved.length} entries, ${DRY_RUN ? "would queue" : "queued"} ${queued} products for resync.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
