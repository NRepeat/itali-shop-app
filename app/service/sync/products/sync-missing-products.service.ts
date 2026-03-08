/**
 * Sync only products that are genuinely missing from Shopify.
 *
 * Targets:
 *   MISSING      — not in productMap, unique SKU, confirmed not in Shopify → CREATE
 *   MAPPED_ORPHAN — productMap entry points to deleted Shopify product → remove stale map → CREATE
 *
 * Skips:
 *   MAPPED_OK / SKU_FOUND — already in Shopify, never touched
 *   AMBIGUOUS             — duplicate SKU without productMap, too risky
 */

import { externalDB, prisma } from "@shared/lib/prisma/prisma.server";
import { processSyncTask } from "./sync-product.worker";

const PAGE_SIZE = 250;
const CONCURRENCY = 3;

const PRODUCTS_QUERY = `
  query SyncMissingProducts($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          variants(first: 100) { edges { node { sku } } }
        }
      }
    }
  }
`;

type Admin = {
  graphql: (query: string, opts?: { variables?: any }) => Promise<Response>;
};

interface ShopifyProductMinimal {
  id: string;
  skus: string[];
}

async function fetchAllShopifyProducts(admin: Admin): Promise<ShopifyProductMinimal[]> {
  const all: ShopifyProductMinimal[] = [];
  let cursor: string | null = null;

  do {
    const res = await admin.graphql(PRODUCTS_QUERY, {
      variables: { first: PAGE_SIZE, after: cursor },
    });
    const { data } = await res.json();
    const conn = data?.products;
    if (!conn) break;

    for (const edge of conn.edges) {
      const skus: string[] = edge.node.variants.edges
        .map((e: any) => e.node.sku as string)
        .filter(Boolean);
      all.push({ id: edge.node.id, skus });
    }

    cursor = conn.pageInfo.hasNextPage ? conn.pageInfo.endCursor : null;
  } while (cursor);

  return all;
}

const PRODUCT_SELECT = {
  product_id: true, model: true, sku: true, upc: true, ean: true,
  jan: true, isbn: true, mpn: true, location: true, quantity: true,
  stock_status_id: true, image: true, manufacturer_id: true, shipping: true,
  price: true, points: true, tax_class_id: true, weight: true,
  weight_class_id: true, length: true, width: true, height: true,
  length_class_id: true, subtract: true, minimum: true, sort_order: true,
  status: true, viewed: true, noindex: true, af_values: true, af_tags: true,
  extra_special: true, import_batch: true, meta_robots: true,
  seo_canonical: true, new: true, rasprodaja: true,
} as const;

export async function syncMissingProducts(
  admin: Admin,
  session: { shop: string; accessToken: string },
): Promise<string[]> {
  const logs: string[] = [];
  const log = (msg = "") => { console.log(msg); logs.push(msg); };

  // 1. Load external products (active only)
  log("Fetching external DB products (active, qty>0)...");
  const externalProducts = await externalDB.bc_product.findMany({
    where: { status: true, quantity: { gt: 0 } },
    select: { product_id: true, model: true },
    orderBy: { product_id: "asc" },
  });
  log(`External active products: ${externalProducts.length}`);

  // 2. productMap
  log("Fetching productMap...");
  const productMaps = await prisma.productMap.findMany({
    select: { localProductId: true, shopifyProductId: true },
  });
  const mapByLocalId = new Map(productMaps.map((m) => [m.localProductId, m.shopifyProductId]));
  log(`productMap entries: ${productMaps.length}`);

  // 3. Shopify products
  log("Fetching Shopify products (paginating)...");
  const shopifyProducts = await fetchAllShopifyProducts(admin);
  log(`Shopify products: ${shopifyProducts.length}`);

  const shopifyIdSet = new Set(shopifyProducts.map((p) => p.id));

  // sku → count in Shopify (to detect variant-level duplicates)
  const shopifyBySku = new Map<string, string[]>(); // sku → [product ids]
  for (const sp of shopifyProducts) {
    for (const sku of sp.skus) {
      if (!shopifyBySku.has(sku)) shopifyBySku.set(sku, []);
      shopifyBySku.get(sku)!.push(sp.id);
    }
  }

  // Duplicate SKUs in external DB
  const skuToExtIds = new Map<string, number[]>();
  for (const p of externalProducts) {
    const sku = p.model?.trim();
    if (!sku) continue;
    if (!skuToExtIds.has(sku)) skuToExtIds.set(sku, []);
    skuToExtIds.get(sku)!.push(p.product_id);
  }
  const duplicateSkuSet = new Set(
    [...skuToExtIds.entries()].filter(([, ids]) => ids.length > 1).map(([sku]) => sku),
  );

  // 4. Classify
  const toCreate: number[] = [];        // MISSING
  const orphanedMapIds: number[] = [];  // MAPPED_ORPHAN localProductIds
  const skipped: string[] = [];

  for (const p of externalProducts) {
    const sku = p.model?.trim() ?? null;
    const shopifyIdFromMap = mapByLocalId.get(p.product_id);

    if (shopifyIdFromMap) {
      if (shopifyIdSet.has(shopifyIdFromMap)) {
        // MAPPED_OK — exists in Shopify, skip
      } else {
        // MAPPED_ORPHAN — map points to deleted Shopify product
        orphanedMapIds.push(p.product_id);
      }
    } else if (!sku) {
      skipped.push(`id=${p.product_id} — no SKU, skipping`);
    } else if (duplicateSkuSet.has(sku)) {
      // AMBIGUOUS — skip, too risky without productMap
      skipped.push(`id=${p.product_id} sku="${sku}" — duplicate SKU, skipping (AMBIGUOUS)`);
    } else if (shopifyBySku.has(sku)) {
      // SKU_FOUND — already in Shopify (just no productMap entry), skip
    } else {
      // MISSING — confirmed not in Shopify
      toCreate.push(p.product_id);
    }
  }

  log(`\nClassification:`);
  log(`  To create (MISSING):          ${toCreate.length}`);
  log(`  Orphaned map → re-create:     ${orphanedMapIds.length}`);
  log(`  Skipped (AMBIGUOUS/no SKU):   ${skipped.length}`);

  if (skipped.length > 0 && skipped.length <= 10) {
    for (const s of skipped) log(`  ⚠ ${s}`);
  }

  const totalToSync = toCreate.length + orphanedMapIds.length;
  if (totalToSync === 0) {
    log("\nNothing to sync — all active products are already in Shopify.");
    return logs;
  }

  // 5. Remove stale productMap entries for MAPPED_ORPHAN
  if (orphanedMapIds.length > 0) {
    log(`\nRemoving ${orphanedMapIds.length} stale productMap entries...`);
    const result = await prisma.productMap.deleteMany({
      where: { localProductId: { in: orphanedMapIds } },
    });
    log(`Deleted ${result.count} stale entries.`);
  }

  // 6. Load full product data for all products to sync
  const allIdsToSync = [...toCreate, ...orphanedMapIds];
  log(`\nLoading full product data for ${allIdsToSync.length} products...`);
  const productsToSync = await externalDB.bc_product.findMany({
    where: { product_id: { in: allIdsToSync } },
    select: PRODUCT_SELECT,
  });

  // 7. Sync with concurrency limit
  log(`\nStarting sync (concurrency=${CONCURRENCY})...`);
  let done = 0;
  let errors = 0;

  for (let i = 0; i < productsToSync.length; i += CONCURRENCY) {
    const batch = productsToSync.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (product) => {
        const idx = ++done;
        try {
          log(`[${idx}/${productsToSync.length}] Creating: ${product.model || product.product_id}`);
          const fakeJob = {
            data: {
              product,
              domain: session.shop,
              shop: session.shop,
              accessToken: session.accessToken,
            },
          };
          await processSyncTask(fakeJob as any);
          log(`[${idx}/${productsToSync.length}] ✓ Done: ${product.model || product.product_id}`);
        } catch (e: any) {
          errors++;
          log(`[${idx}/${productsToSync.length}] ✗ Error ${product.model || product.product_id}: ${e.message}`);
        }
      }),
    );
  }

  log(`\nSync complete. Created: ${done - errors}  Errors: ${errors}`);
  return logs;
}
