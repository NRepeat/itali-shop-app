/**
 * Compare products between external DB and Shopify.
 *
 * Strategy (двоетапне порівняння):
 *   1. productMap (localProductId → shopifyProductId) — точний маппінг, не залежить від SKU
 *   2. SKU-fallback (model → variant.sku) — для продуктів без запису в productMap
 *      - якщо SKU унікальний в зовнішній БД → надійно
 *      - якщо SKU дублюється → позначається як AMBIGUOUS, не рахується ні тут ні там
 *
 * Outputs:
 *   - Duplicate SKUs in external DB
 *   - External products confirmed MISSING from Shopify (via map + SKU)
 *   - External products AMBIGUOUS (duplicate SKU, не в productMap)
 *   - productMap entries orphaned (Shopify product gone)
 *   - productMap entries dangling (external product gone)
 *   - Shopify products with no external match
 *
 * Run: dotenv -e .env tsx scripts/compare-products.ts
 *
 * Optional env:
 *   COMPARE_INCLUDE_INACTIVE=true  — also include status=false products
 */

import { PrismaClient } from "../prisma/generated/app_client/client";
import { PrismaClient as ExternalPrismaClient } from "../prisma/generated/external_client/client";
import { client } from "../app/shared/lib/shopify/client/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();
const externalDB = new ExternalPrismaClient();

const INCLUDE_INACTIVE = process.env.COMPARE_INCLUDE_INACTIVE === "true";
const PAGE_SIZE = 250;

// ─── Types ────────────────────────────────────────────────────────────────────

interface ShopifyProduct {
  id: string;
  title: string;
  handle: string;
  skus: string[];
}

// ─── Shopify fetch ────────────────────────────────────────────────────────────

const PRODUCTS_QUERY = `
  query CompareProducts($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          title
          handle
          variants(first: 100) {
            edges { node { sku } }
          }
        }
      }
    }
  }
`;

async function fetchAllShopifyProducts(
  accessToken: string,
  shopDomain: string,
): Promise<ShopifyProduct[]> {
  const all: ShopifyProduct[] = [];
  let cursor: string | null = null;

  do {
    const res: any = await client.request({
      query: PRODUCTS_QUERY,
      variables: { first: PAGE_SIZE, after: cursor },
      accessToken,
      shopDomain,
    });

    const conn = res?.products;
    if (!conn) break;

    for (const edge of conn.edges) {
      const node = edge.node;
      const skus: string[] = node.variants.edges
        .map((e: any) => e.node.sku as string)
        .filter(Boolean);
      all.push({ id: node.id, title: node.title, handle: node.handle, skus });
    }

    cursor = conn.pageInfo.hasNextPage ? conn.pageInfo.endCursor : null;
  } while (cursor);

  return all;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// ─── Output tee (console + file) ──────────────────────────────────────────────

const outputLines: string[] = [];

function log(msg = "") {
  console.log(msg);
  outputLines.push(msg);
}

function saveOutput() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = path.resolve(`compare-products-${timestamp}.txt`);
  fs.writeFileSync(filename, outputLines.join("\n") + "\n", "utf8");
  console.log(`\nSaved to: ${filename}`);
}

function section(title: string) {
  log(`\n${"═".repeat(70)}`);
  log(`  ${title}`);
  log("═".repeat(70));
}

function pad(s: string | number, n: number) {
  return String(s).padEnd(n);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // 1. Session
  const session = await prisma.session.findFirst({
    where: { shop: { not: undefined } },
    orderBy: { id: "desc" },
  });
  if (!session?.accessToken) throw new Error("No Shopify session found in DB");
  log(`Shop: ${session.shop}`);
  log(`Include inactive: ${INCLUDE_INACTIVE}`);

  // 2. External products
  log("\nFetching external DB products...");
  const externalProducts = await externalDB.bc_product.findMany({
    where: INCLUDE_INACTIVE ? {} : { status: true },
    select: {
      product_id: true,
      model: true,
      status: true,
      quantity: true,
    },
    orderBy: { product_id: "asc" },
  });
  log(`External products: ${externalProducts.length}`);

  // 3. Detect duplicate SKUs (model) in external DB
  const skuToIds = new Map<string, number[]>();
  for (const p of externalProducts) {
    const sku = p.model?.trim();
    if (!sku) continue;
    if (!skuToIds.has(sku)) skuToIds.set(sku, []);
    skuToIds.get(sku)!.push(p.product_id);
  }
  const duplicateSkus = [...skuToIds.entries()].filter(([, ids]) => ids.length > 1);
  const duplicateSkuSet = new Set(duplicateSkus.map(([sku]) => sku));

  // 4. productMap
  log("Fetching productMap...");
  const productMaps = await prisma.productMap.findMany({
    select: { localProductId: true, shopifyProductId: true },
  });
  const mapByLocalId = new Map(productMaps.map((m) => [m.localProductId, m.shopifyProductId]));
  const mapByShopifyId = new Map(productMaps.map((m) => [m.shopifyProductId, m.localProductId]));
  log(`productMap entries: ${productMaps.length}`);

  // 5. Shopify products
  log("Fetching Shopify products (paginating)...");
  const shopifyProducts = await fetchAllShopifyProducts(session.accessToken, session.shop);
  log(`Shopify products: ${shopifyProducts.length}`);

  const shopifyById = new Map(shopifyProducts.map((p) => [p.id, p]));

  // sku → list of Shopify products that have it
  const shopifyBySku = new Map<string, ShopifyProduct[]>();
  for (const sp of shopifyProducts) {
    for (const sku of sp.skus) {
      if (!shopifyBySku.has(sku)) shopifyBySku.set(sku, []);
      shopifyBySku.get(sku)!.push(sp);
    }
  }

  const externalIdSet = new Set(externalProducts.map((p) => p.product_id));

  // ─── Classify each external product ────────────────────────────────────────
  //
  // For each external product we decide:
  //   MAPPED_OK        — in productMap AND Shopify product exists
  //   MAPPED_ORPHAN    — in productMap BUT Shopify product is gone
  //   SKU_FOUND        — NOT in productMap, but SKU found in Shopify (unique SKU)
  //   SKU_AMBIGUOUS    — NOT in productMap, SKU is duplicated in external DB
  //   MISSING          — NOT in productMap, SKU not found in Shopify (unique SKU)
  //   NO_SKU           — model is empty

  type Status = "MAPPED_OK" | "MAPPED_ORPHAN" | "SKU_FOUND" | "SKU_AMBIGUOUS" | "MISSING" | "NO_SKU";

  interface ClassifiedProduct {
    product_id: number;
    model: string | null;
    status: boolean;
    quantity: number;
    classification: Status;
    shopifyId?: string; // resolved Shopify ID if any
    note?: string;
  }

  const classified: ClassifiedProduct[] = [];

  for (const p of externalProducts) {
    const sku = p.model?.trim() ?? null;
    const shopifyIdFromMap = mapByLocalId.get(p.product_id);

    let classification: Status;
    let shopifyId: string | undefined;
    let note: string | undefined;

    if (shopifyIdFromMap) {
      // Has productMap entry
      if (shopifyById.has(shopifyIdFromMap)) {
        classification = "MAPPED_OK";
        shopifyId = shopifyIdFromMap;
      } else {
        classification = "MAPPED_ORPHAN";
        shopifyId = shopifyIdFromMap;
        note = "productMap points to deleted Shopify product";
      }
    } else if (!sku) {
      classification = "NO_SKU";
    } else if (duplicateSkuSet.has(sku)) {
      // SKU exists in multiple external products → can't reliably match
      classification = "SKU_AMBIGUOUS";
      const shopifyMatches = shopifyBySku.get(sku);
      if (shopifyMatches?.length) {
        shopifyId = shopifyMatches[0].id;
        note = `${shopifyMatches.length} Shopify product(s) have this SKU, but which maps to this product_id is unknown`;
      } else {
        note = "Duplicate SKU in external DB, SKU not found in Shopify either";
      }
    } else {
      // Unique SKU, check Shopify by SKU
      const shopifyMatches = shopifyBySku.get(sku);
      if (shopifyMatches?.length) {
        classification = "SKU_FOUND";
        shopifyId = shopifyMatches[0].id;
        if (shopifyMatches.length > 1) {
          note = `WARNING: SKU matches ${shopifyMatches.length} Shopify products`;
        }
      } else {
        classification = "MISSING";
      }
    }

    classified.push({
      ...p,
      model: sku,
      classification,
      shopifyId,
      note,
    });
  }

  // ─── Shopify products with no external counterpart ─────────────────────────
  //
  // Shopify product is "orphaned" if:
  //   - NOT referenced by productMap
  //   - AND none of its SKUs match any external product (unique or duplicate)

  const externalSkuSet = new Set(
    externalProducts.map((p) => p.model?.trim()).filter(Boolean) as string[],
  );

  const shopifyOrphans = shopifyProducts.filter((sp) => {
    if (mapByShopifyId.has(sp.id)) return false;
    return !sp.skus.some((sku) => externalSkuSet.has(sku));
  });

  // productMap dangling (local product gone from external DB)
  const danglingMaps = productMaps.filter((m) => !externalIdSet.has(m.localProductId));

  // ─── Counts ─────────────────────────────────────────────────────────────────

  const byStatus = (s: Status) => classified.filter((c) => c.classification === s);
  const missing = byStatus("MISSING");
  const ambiguous = byStatus("SKU_AMBIGUOUS");
  const mappedOrphan = byStatus("MAPPED_ORPHAN");
  const skuFound = byStatus("SKU_FOUND");
  const mappedOk = byStatus("MAPPED_OK");

  // ─── Output ─────────────────────────────────────────────────────────────────

  section("STATS");
  log(`  External products loaded (${INCLUDE_INACTIVE ? "all" : "active only"}): ${externalProducts.length}`);
  log(`  Shopify products:                 ${shopifyProducts.length}`);
  log(`  productMap entries:               ${productMaps.length}`);
  log(`  ─────────────────────────────────────────────`);
  log(`  ✓ MAPPED_OK (map + Shopify found):  ${mappedOk.length}`);
  log(`  ✓ SKU_FOUND (no map, SKU matched):  ${skuFound.length}`);
  log(`  ✗ MISSING   (no map, SKU not found):${missing.length}`);
  log(`  ⚠ AMBIGUOUS (duplicate SKU, no map):${ambiguous.length}`);
  log(`  ⚠ MAPPED_ORPHAN (Shopify deleted):  ${mappedOrphan.length}`);
  log(`  ─────────────────────────────────────────────`);
  log(`  Duplicate SKUs in external DB:    ${duplicateSkus.length}`);
  log(`  productMap dangling (ext gone):   ${danglingMaps.length}`);
  log(`  Shopify orphans (no ext match):   ${shopifyOrphans.length}`);

  // Duplicate SKUs
  if (duplicateSkus.length > 0) {
    section(`DUPLICATE SKUs IN EXTERNAL DB (${duplicateSkus.length})`);
    log("  SKU appears on multiple product_ids — sync by SKU alone is unreliable for these.\n");
    for (const [sku, ids] of duplicateSkus.slice(0, 50)) {
      const rows = externalProducts.filter((p) => p.model?.trim() === sku);
      log(`  SKU="${sku}"`);
      for (const r of rows) {
        const inShopify = shopifyBySku.get(sku)?.map((s) => s.handle).join(", ") ?? "—";
        log(`    id=${r.product_id}  status=${r.status}  qty=${r.quantity}  shopify=${inShopify}`);
      }
    }
    if (duplicateSkus.length > 50) log(`  ... and ${duplicateSkus.length - 50} more`);
  }

  // Missing — confirmed not in Shopify
  if (missing.length > 0) {
    section(`MISSING FROM SHOPIFY — confirmed (${missing.length})`);
    log("  Not in productMap, unique SKU, NOT found in Shopify variants.\n");
    const activeM = missing.filter((p) => p.status && p.quantity > 0);
    const inactiveM = missing.filter((p) => !p.status || p.quantity <= 0);
    log(`  Active (qty>0): ${activeM.length}   Inactive/sold-out: ${inactiveM.length}`);
    if (activeM.length > 0) {
      log("\n  Active missing products (first 50):");
      for (const p of activeM.slice(0, 50)) {
        log(
          `    ${pad(p.product_id, 8)} sku="${p.model}"  qty=${pad(p.quantity, 5)}`,
        );
      }
      if (activeM.length > 50) log(`    ... and ${activeM.length - 50} more`);
    }
    if (inactiveM.length > 0 && inactiveM.length <= 20) {
      log("\n  Inactive/sold-out missing products:");
      for (const p of inactiveM) {
        log(
          `    ${pad(p.product_id, 8)} sku="${p.model}"  qty=${p.quantity}  status=${p.status}`,
        );
      }
    }
  }

  // Ambiguous — duplicate SKU, no productMap
  if (ambiguous.length > 0) {
    section(`AMBIGUOUS — duplicate SKU, no productMap entry (${ambiguous.length})`);
    log("  Cannot reliably determine if these are in Shopify without productMap.\n");
    for (const p of ambiguous.slice(0, 50)) {
      log(
        `  id=${pad(p.product_id, 8)} sku="${p.model}"  qty=${p.quantity}  status=${p.status}`,
      );
      if (p.note) log(`    → ${p.note}`);
    }
    if (ambiguous.length > 50) log(`  ... and ${ambiguous.length - 50} more`);
  }

  // MAPPED_ORPHAN
  if (mappedOrphan.length > 0) {
    section(`MAPPED_ORPHAN — productMap points to deleted Shopify product (${mappedOrphan.length})`);
    for (const p of mappedOrphan.slice(0, 50)) {
      log(
        `  id=${p.product_id}  sku="${p.model}"  shopifyId=${p.shopifyId}  qty=${p.quantity}`,
      );
    }
    if (mappedOrphan.length > 50) log(`  ... and ${mappedOrphan.length - 50} more`);
  }

  // Dangling productMap
  if (danglingMaps.length > 0) {
    section(`productMap DANGLING — external product deleted (${danglingMaps.length})`);
    for (const m of danglingMaps.slice(0, 50)) {
      const sp = shopifyById.get(m.shopifyProductId);
      const spInfo = sp ? `handle="${sp.handle}"` : "NOT IN SHOPIFY";
      log(`  localProductId=${m.localProductId}  shopifyId=${m.shopifyProductId}  (${spInfo})`);
    }
    if (danglingMaps.length > 50) log(`  ... and ${danglingMaps.length - 50} more`);
  }

  // Shopify orphans
  if (shopifyOrphans.length > 0) {
    section(`SHOPIFY ORPHANS — no external match (${shopifyOrphans.length})`);
    log("  Not in productMap AND no variant SKU matches external DB.\n");
    for (const sp of shopifyOrphans.slice(0, 50)) {
      log(`  ${sp.id}  handle="${sp.handle}"  skus=[${sp.skus.join(", ")}]`);
    }
    if (shopifyOrphans.length > 50) log(`  ... and ${shopifyOrphans.length - 50} more`);
  }

  log("\nDone.");
  saveOutput();
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    await externalDB.$disconnect();
  });
