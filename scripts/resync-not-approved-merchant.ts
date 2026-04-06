/**
 * Fetch all disapproved products from Google Merchant Center,
 * delete them, and re-queue for a clean re-sync.
 *
 * Run: npx dotenv-cli -e .env -- tsx scripts/resync-not-approved-merchant.ts
 * Dry: npx dotenv-cli -e .env -- tsx scripts/resync-not-approved-merchant.ts --dry-run
 */

import { GoogleAuth } from "google-auth-library";
import { MERCHANT_ID, deleteProduct } from "../app/service/google-merchant/client";
import { googleMerchantSyncQueue } from "../app/service/sync/queues";
import { prisma } from "../app/shared/lib/prisma/prisma.server";
import { client } from "../app/shared/lib/shopify/client/client";

// Use REST API instead of gRPC — gRPC has auth issues in this environment
const auth = new GoogleAuth({
  keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_PATH || "/app/service-account.json",
  scopes: ["https://www.googleapis.com/auth/content"],
});

async function listProductsREST() {
  const authClient = await auth.getClient();
  const token = await authClient.getAccessToken();
  const allProducts: any[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(`https://merchantapi.googleapis.com/products/v1beta/accounts/${MERCHANT_ID}/products`);
    url.searchParams.set("pageSize", "1000");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token.token}` },
    });

    if (!res.ok) throw new Error(`Merchant API ${res.status}: ${await res.text()}`);

    const data = await res.json();
    if (data.products) allProducts.push(...data.products);
    pageToken = data.nextPageToken;
  } while (pageToken);

  return allProducts;
}

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

const GET_PRODUCT_BY_VARIANT_ID = `#graphql
  ${PRODUCT_METAFIELDS_FRAGMENT}
  query GetProductByVariantId($id: ID!) {
    productVariant(id: $id) {
      product {
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

  console.log("Fetching products from Google Merchant Center (REST)...");
  const products = await listProductsREST();
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
      (ds: any) =>
        ds.status === "DISAPPROVED" || ds.status === "REJECTED" ||
        ds.disapprovedCountries?.length > 0,
    );

    if (isDisapproved) {
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

  // offerId = Shopify variant numeric ID
  // Collect unique variant IDs, then resolve to parent products
  const variantIdsToResync = new Set<string>();

  for (const entry of disapproved) {
    console.log(`${DRY_RUN ? "[DRY] Would delete" : "Deleting"}: ${entry.offerId} (${entry.lang}~${entry.label})`);
    entry.issues.forEach((issue) => console.log(`   - ${issue}`));
    if (!DRY_RUN) await deleteProduct(entry.offerId, entry.lang, entry.label);

    variantIdsToResync.add(entry.offerId);
  }

  // Resolve variant IDs to unique products via Shopify
  const seenProductIds = new Set<string>();
  const productsToQueue: any[] = [];

  console.log(`\nResolving ${variantIdsToResync.size} unique variants to products...\n`);

  for (const variantId of variantIdsToResync) {
    const variantGid = `gid://shopify/ProductVariant/${variantId}`;

    try {
      const response: any = await client.request({
        query: GET_PRODUCT_BY_VARIANT_ID,
        variables: { id: variantGid },
        accessToken: session.accessToken,
        shopDomain: session.shop,
      });

      const product = response.productVariant?.product;
      if (!product) {
        console.log(`Variant ${variantId} not found in Shopify, skipping.`);
        continue;
      }

      if (seenProductIds.has(product.id)) continue;
      seenProductIds.add(product.id);
      productsToQueue.push(product);
    } catch (err: any) {
      console.error(`Failed to fetch variant ${variantId}: ${err.message}`);
    }
  }

  console.log(`Found ${productsToQueue.length} unique products to resync.\n`);

  let queued = 0;

  for (const product of productsToQueue) {
    const numericId = product.id.split("/").pop();

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
    console.log(`${DRY_RUN ? "[DRY] Would queue" : "Queued"}: ${product.handle} (${queued}/${productsToQueue.length})`);
  }

  console.log(`\n${DRY_RUN ? "[DRY RUN] Would have deleted" : "Deleted"} ${disapproved.length} entries, ${DRY_RUN ? "would queue" : "queued"} ${queued} products for resync.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
