import * as fs from "fs";
import * as path from "path";
import { externalDB, prisma } from "@shared/lib/prisma/prisma.server";

const PAGE_SIZE = 250;

const COMPARE_PRODUCTS_QUERY = `
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

interface ShopifyProduct {
  id: string;
  title: string;
  handle: string;
  skus: string[];
}

type Admin = {
  graphql: (query: string, opts?: { variables?: any }) => Promise<Response>;
};

async function fetchAllShopifyProducts(admin: Admin): Promise<ShopifyProduct[]> {
  const all: ShopifyProduct[] = [];
  let cursor: string | null = null;

  do {
    const res = await admin.graphql(COMPARE_PRODUCTS_QUERY, {
      variables: { first: PAGE_SIZE, after: cursor },
    });
    const { data } = await res.json();
    const conn = data?.products;
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

export async function compareProducts(
  admin: Admin,
  includeInactive = false,
): Promise<string[]> {
  const logs: string[] = [];
  const log = (msg = "") => logs.push(msg);

  log("Fetching external DB products...");
  const externalProducts = await externalDB.bc_product.findMany({
    where: includeInactive ? {} : { status: true },
    select: {
      product_id: true,
      model: true,
      status: true,
      quantity: true,
    },
    orderBy: { product_id: "asc" },
  });
  log(`External products: ${externalProducts.length}`);

  // Duplicate SKUs
  const skuToIds = new Map<string, number[]>();
  for (const p of externalProducts) {
    const sku = p.model?.trim();
    if (!sku) continue;
    if (!skuToIds.has(sku)) skuToIds.set(sku, []);
    skuToIds.get(sku)!.push(p.product_id);
  }
  const duplicateSkus = [...skuToIds.entries()].filter(([, ids]) => ids.length > 1);
  const duplicateSkuSet = new Set(duplicateSkus.map(([sku]) => sku));

  log("Fetching productMap...");
  const productMaps = await prisma.productMap.findMany({
    select: { localProductId: true, shopifyProductId: true },
  });
  const mapByLocalId = new Map(productMaps.map((m) => [m.localProductId, m.shopifyProductId]));
  const mapByShopifyId = new Map(productMaps.map((m) => [m.shopifyProductId, m.localProductId]));
  log(`productMap entries: ${productMaps.length}`);

  log("Fetching Shopify products (paginating)...");
  const shopifyProducts = await fetchAllShopifyProducts(admin);
  log(`Shopify products: ${shopifyProducts.length}`);

  const shopifyById = new Map(shopifyProducts.map((p) => [p.id, p]));

  const shopifyBySku = new Map<string, ShopifyProduct[]>();
  for (const sp of shopifyProducts) {
    for (const sku of sp.skus) {
      if (!shopifyBySku.has(sku)) shopifyBySku.set(sku, []);
      shopifyBySku.get(sku)!.push(sp);
    }
  }

  const externalIdSet = new Set(externalProducts.map((p) => p.product_id));

  // Classify
  type Status = "MAPPED_OK" | "MAPPED_ORPHAN" | "SKU_FOUND" | "SKU_AMBIGUOUS" | "MISSING" | "NO_SKU";
  interface Classified {
    product_id: number;
    model: string | null;
    status: boolean;
    quantity: number;
    classification: Status;
    shopifyId?: string;
    note?: string;
  }

  const classified: Classified[] = [];

  for (const p of externalProducts) {
    const sku = p.model?.trim() ?? null;
    const shopifyIdFromMap = mapByLocalId.get(p.product_id);
    let classification: Status;
    let shopifyId: string | undefined;
    let note: string | undefined;

    if (shopifyIdFromMap) {
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
      classification = "SKU_AMBIGUOUS";
      const shopifyMatches = shopifyBySku.get(sku);
      shopifyId = shopifyMatches?.[0]?.id;
      note = shopifyMatches?.length
        ? `${shopifyMatches.length} Shopify product(s) have this SKU — unknown which maps to this product_id`
        : "Duplicate SKU in external DB, not found in Shopify either";
    } else {
      const shopifyMatches = shopifyBySku.get(sku);
      if (shopifyMatches?.length) {
        classification = "SKU_FOUND";
        shopifyId = shopifyMatches[0].id;
        if (shopifyMatches.length > 1) note = `WARNING: SKU matches ${shopifyMatches.length} Shopify products`;
      } else {
        classification = "MISSING";
      }
    }

    classified.push({ ...p, model: sku, classification, shopifyId, note });
  }

  const externalSkuSet = new Set(
    externalProducts.map((p) => p.model?.trim()).filter(Boolean) as string[],
  );

  const shopifyOrphans = shopifyProducts.filter(
    (sp) => !mapByShopifyId.has(sp.id) && !sp.skus.some((sku) => externalSkuSet.has(sku)),
  );
  const danglingMaps = productMaps.filter((m) => !externalIdSet.has(m.localProductId));

  const byStatus = (s: Status) => classified.filter((c) => c.classification === s);
  const missing = byStatus("MISSING");
  const ambiguous = byStatus("SKU_AMBIGUOUS");
  const mappedOrphan = byStatus("MAPPED_ORPHAN");
  const skuFound = byStatus("SKU_FOUND");
  const mappedOk = byStatus("MAPPED_OK");

  const sep = "─".repeat(50);

  log("");
  log("═".repeat(55));
  log(`  STATS`);
  log("═".repeat(55));
  log(`  External (${includeInactive ? "all" : "active only"}):  ${externalProducts.length}`);
  log(`  Shopify products:        ${shopifyProducts.length}`);
  log(`  productMap entries:      ${productMaps.length}`);
  log(`  ${sep}`);
  log(`  ✓ MAPPED_OK:             ${mappedOk.length}`);
  log(`  ✓ SKU_FOUND:             ${skuFound.length}`);
  log(`  ✗ MISSING:               ${missing.length}`);
  log(`  ⚠ AMBIGUOUS:             ${ambiguous.length}`);
  log(`  ⚠ MAPPED_ORPHAN:         ${mappedOrphan.length}`);
  log(`  ${sep}`);
  log(`  Duplicate SKUs in ext:   ${duplicateSkus.length}`);
  log(`  productMap dangling:     ${danglingMaps.length}`);
  log(`  Shopify orphans:         ${shopifyOrphans.length}`);

  if (duplicateSkus.length > 0) {
    log("");
    log("═".repeat(55));
    log(`  DUPLICATE SKUs IN EXTERNAL DB (${duplicateSkus.length})`);
    log("═".repeat(55));
    for (const [sku, ids] of duplicateSkus.slice(0, 30)) {
      const rows = externalProducts.filter((p) => p.model?.trim() === sku);
      log(`  SKU="${sku}"`);
      for (const r of rows) {
        const inShopify = shopifyBySku.get(sku)?.map((s) => s.handle).join(", ") ?? "—";
        log(`    id=${r.product_id}  status=${r.status}  qty=${r.quantity}  shopify=${inShopify}`);
      }
    }
    if (duplicateSkus.length > 30) log(`  ... and ${duplicateSkus.length - 30} more`);
  }

  if (missing.length > 0) {
    log("");
    log("═".repeat(55));
    log(`  MISSING FROM SHOPIFY — confirmed (${missing.length})`);
    log("═".repeat(55));
    const activeM = missing.filter((p) => p.status && p.quantity > 0);
    const inactiveM = missing.filter((p) => !p.status || p.quantity <= 0);
    log(`  Active (qty>0): ${activeM.length}   Inactive/sold-out: ${inactiveM.length}`);
    if (activeM.length > 0) {
      log(`\n  Active missing (first 50):`);
      for (const p of activeM.slice(0, 50)) {
        log(`    id=${String(p.product_id).padEnd(8)} sku="${p.model}"  qty=${p.quantity}`);
      }
      if (activeM.length > 50) log(`    ... and ${activeM.length - 50} more`);
    }
    if (inactiveM.length > 0 && inactiveM.length <= 20) {
      log(`\n  Inactive missing:`);
      for (const p of inactiveM) {
        log(`    id=${p.product_id}  sku="${p.model}"  qty=${p.quantity}  status=${p.status}`);
      }
    }
  }

  if (ambiguous.length > 0) {
    log("");
    log("═".repeat(55));
    log(`  AMBIGUOUS — duplicate SKU, no productMap (${ambiguous.length})`);
    log("═".repeat(55));
    for (const p of ambiguous.slice(0, 30)) {
      log(`  id=${String(p.product_id).padEnd(8)} sku="${p.model}"  qty=${p.quantity}`);
      if (p.note) log(`    → ${p.note}`);
    }
    if (ambiguous.length > 30) log(`  ... and ${ambiguous.length - 30} more`);
  }

  if (mappedOrphan.length > 0) {
    log("");
    log("═".repeat(55));
    log(`  MAPPED_ORPHAN — Shopify product deleted (${mappedOrphan.length})`);
    log("═".repeat(55));
    for (const p of mappedOrphan.slice(0, 30)) {
      log(`  id=${p.product_id}  sku="${p.model}"  shopifyId=${p.shopifyId}`);
    }
    if (mappedOrphan.length > 30) log(`  ... and ${mappedOrphan.length - 30} more`);
  }

  if (danglingMaps.length > 0) {
    log("");
    log("═".repeat(55));
    log(`  productMap DANGLING — external product deleted (${danglingMaps.length})`);
    log("═".repeat(55));
    for (const m of danglingMaps.slice(0, 30)) {
      const sp = shopifyById.get(m.shopifyProductId);
      log(`  localId=${m.localProductId}  shopifyId=${m.shopifyProductId}  ${sp ? `handle="${sp.handle}"` : "NOT IN SHOPIFY"}`);
    }
    if (danglingMaps.length > 30) log(`  ... and ${danglingMaps.length - 30} more`);
  }

  if (shopifyOrphans.length > 0) {
    log("");
    log("═".repeat(55));
    log(`  SHOPIFY ORPHANS — no external match (${shopifyOrphans.length})`);
    log("═".repeat(55));
    for (const sp of shopifyOrphans.slice(0, 30)) {
      log(`  ${sp.id}  handle="${sp.handle}"  skus=[${sp.skus.join(", ")}]`);
    }
    if (shopifyOrphans.length > 30) log(`  ... and ${shopifyOrphans.length - 30} more`);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = path.resolve(`compare-products-${timestamp}.txt`);
  fs.writeFileSync(filename, logs.join("\n") + "\n", "utf8");
  logs.push(`Saved to: ${filename}`);

  return logs;
}
