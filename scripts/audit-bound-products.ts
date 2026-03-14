/**
 * Audit & fix bound-products and recommended_products metafields.
 *
 * For each product in external DB that has related_article or related entries,
 * checks whether:
 *   1. The current product exists in Shopify (via productMap or SKU)
 *   2. Each linked product_id resolves to a Shopify GID
 *   3. The Shopify metafield value matches what it should be
 *
 * Outputs a report. With --fix, rewrites incorrect metafields.
 *
 * Run:
 *   npx dotenv-cli -e .env -- tsx scripts/audit-bound-products.ts
 *   npx dotenv-cli -e .env -- tsx scripts/audit-bound-products.ts --fix
 *   npx dotenv-cli -e .env -- tsx scripts/audit-bound-products.ts --product-id 605
 */

import { PrismaClient } from "../prisma/generated/app_client/client";
import { PrismaClient as ExternalPrismaClient } from "../prisma/generated/external_client/client";
import { client } from "../app/shared/lib/shopify/client/client";
import { linkProducts } from "../app/service/sync/products/link-products";

const prisma = new PrismaClient();
const externalDB = new ExternalPrismaClient();

const FIX = process.argv.includes("--fix");
const SINGLE_ID = (() => {
  const idx = process.argv.indexOf("--product-id");
  return idx !== -1 ? parseInt(process.argv[idx + 1], 10) : null;
})();

// ─── Shopify query ────────────────────────────────────────────────────────────

const GET_METAFIELDS_QUERY = `
  query AuditBoundMetafields($id: ID!) {
    product(id: $id) {
      id title handle
      boundProducts: metafield(namespace: "custom", key: "bound-products") {
        value
      }
      recommendedProducts: metafield(namespace: "custom", key: "recommended_products") {
        value
      }
    }
  }
`;

async function fetchShopifyMetafields(
  id: string,
  accessToken: string,
  shopDomain: string,
): Promise<{ title: string; handle: string; boundProducts: string[] | null; recommendedProducts: string[] | null } | null> {
  const res: any = await client.request({
    query: GET_METAFIELDS_QUERY,
    variables: { id },
    accessToken,
    shopDomain,
  });
  const p = res?.product;
  if (!p) return null;
  return {
    title: p.title,
    handle: p.handle,
    boundProducts: p.boundProducts?.value ? JSON.parse(p.boundProducts.value) : null,
    recommendedProducts: p.recommendedProducts?.value ? JSON.parse(p.recommendedProducts.value) : null,
  };
}

async function resolveShopifyId(
  localProductId: number,
  accessToken: string,
  shopDomain: string,
): Promise<string | null> {
  const map = await prisma.productMap.findUnique({ where: { localProductId } });
  if (map) return map.shopifyProductId;

  // SKU fallback — raw query avoids Prisma P2020 on date_available='0000-00-00'
  const rows = await externalDB.$queryRawUnsafe<Array<{ model: string }>>(
    `SELECT model FROM bc_product WHERE product_id = ${localProductId} LIMIT 1`,
  );
  const model = rows[0]?.model?.trim();
  if (!model) return null;

  const FIND_QUERY = `query($q: String!) { products(first:1,query:$q) { nodes { id } } }`;
  const res: any = await client.request({
    query: FIND_QUERY,
    variables: { q: `sku:${model}` },
    accessToken,
    shopDomain,
  });
  const found = res?.products?.nodes?.[0]?.id ?? null;
  if (found) {
    await prisma.productMap.upsert({
      where: { localProductId },
      update: { shopifyProductId: found },
      create: { localProductId, shopifyProductId: found },
    }).catch(() => {}); // ignore P2002
  }
  return found;
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const session = await prisma.session.findFirst({
    where: { shop: { not: undefined } },
    orderBy: { id: "desc" },
  });
  if (!session?.accessToken) throw new Error("No Shopify session found in DB");
  console.log(`Shop: ${session.shop}  mode=${FIX ? "FIX" : "AUDIT"}${SINGLE_ID ? `  product_id=${SINGLE_ID}` : ""}\n`);

  // Get all products that have related_article OR related entries
  let productIds: number[];

  if (SINGLE_ID) {
    productIds = [SINGLE_ID];
  } else {
    const articleRows = await externalDB.bc_product_related_article.findMany({
      select: { article_id: true },
      distinct: ["article_id"],
    });
    const relatedRows = await externalDB.bc_product_related.findMany({
      select: { product_id: true },
      distinct: ["product_id"],
    });
    const ids = new Set([
      ...articleRows.map((r) => r.article_id),
      ...relatedRows.map((r) => r.product_id),
    ]);
    productIds = [...ids];
  }

  console.log(`Products with relationships: ${productIds.length}`);

  let ok = 0;
  let mismatch = 0;
  let missing = 0;
  let fixed = 0;
  let fixErrors = 0;

  const mismatches: Array<{
    product_id: number;
    model: string;
    shopifyId: string;
    handle: string;
    issue: string;
    details: string;
  }> = [];

  for (let i = 0; i < productIds.length; i++) {
    const productId = productIds[i];

    if ((i + 1) % 100 === 0) {
      console.log(`  Progress: ${i + 1}/${productIds.length}  ok=${ok}  mismatch=${mismatch}  missing=${missing}`);
    }

    // Resolve Shopify ID for this product
    const shopifyId = await resolveShopifyId(productId, session.accessToken, session.shop);
    if (!shopifyId) {
      missing++;
      continue;
    }

    // Fetch current metafields from Shopify
    const shopifyData = await fetchShopifyMetafields(shopifyId, session.accessToken, session.shop);
    if (!shopifyData) {
      missing++;
      continue;
    }

    const extModel = (await externalDB.$queryRawUnsafe<Array<{ model: string }>>(
      `SELECT model FROM bc_product WHERE product_id = ${productId}`,
    ))[0]?.model ?? "?";

    // Compute expected bound-products
    const boundArticles = await externalDB.bc_product_related_article.findMany({
      where: { article_id: productId },
    });
    const expectedBound: string[] = [];
    for (const a of boundArticles) {
      const sid = await resolveShopifyId(a.product_id, session.accessToken, session.shop);
      if (sid && sid !== shopifyId) expectedBound.push(sid);
    }

    // Compute expected recommended_products
    const relatedRows = await externalDB.bc_product_related.findMany({
      where: { product_id: productId },
    });
    const expectedRecommended: string[] = [];
    for (const r of relatedRows) {
      const sid = await resolveShopifyId(r.related_id, session.accessToken, session.shop);
      if (sid) expectedRecommended.push(sid);
    }

    const currentBound = shopifyData.boundProducts ?? [];
    const currentRecommended = shopifyData.recommendedProducts ?? [];

    const boundOk = arraysEqual(currentBound, expectedBound);
    const recommendedOk = arraysEqual(currentRecommended, expectedRecommended);

    if (boundOk && recommendedOk) {
      ok++;
      continue;
    }

    mismatch++;
    const issues: string[] = [];
    if (!boundOk) {
      issues.push(
        `bound-products: has [${currentBound.length}] expected [${expectedBound.length}]` +
        (currentBound.length === 0 && expectedBound.length > 0 ? " ← EMPTY (should have links)" : "") +
        (currentBound.length > 0 && expectedBound.length === 0 ? " ← HAS STALE LINKS (should be empty)" : ""),
      );
    }
    if (!recommendedOk) {
      issues.push(
        `recommended_products: has [${currentRecommended.length}] expected [${expectedRecommended.length}]`,
      );
    }

    mismatches.push({
      product_id: productId,
      model: extModel,
      shopifyId,
      handle: shopifyData.handle,
      issue: issues.join(" | "),
      details: [
        !boundOk ? `  bound current:  ${JSON.stringify(currentBound)}` : "",
        !boundOk ? `  bound expected: ${JSON.stringify(expectedBound)}` : "",
        !recommendedOk ? `  rec current:    ${JSON.stringify(currentRecommended)}` : "",
        !recommendedOk ? `  rec expected:   ${JSON.stringify(expectedRecommended)}` : "",
      ].filter(Boolean).join("\n"),
    });

    if (FIX) {
      try {
        await linkProducts({ product_id: productId, shopifyProductId: shopifyId }, session.accessToken, session.shop);
        fixed++;
        console.log(`  ✓ Fixed: product_id=${productId} (${extModel})`);
      } catch (err: any) {
        fixErrors++;
        console.error(`  ✗ Fix failed: product_id=${productId}: ${err.message}`);
      }
    }
  }

  // ─── Report ─────────────────────────────────────────────────────────────────
  console.log(`\n${"═".repeat(70)}`);
  console.log(`  AUDIT RESULTS`);
  console.log("═".repeat(70));
  console.log(`  Products checked  : ${productIds.length}`);
  console.log(`  OK                : ${ok}`);
  console.log(`  Mismatch          : ${mismatch}`);
  console.log(`  Missing in Shopify: ${missing}`);
  if (FIX) {
    console.log(`  Fixed             : ${fixed}`);
    console.log(`  Fix errors        : ${fixErrors}`);
  }

  if (mismatches.length > 0 && !FIX) {
    console.log(`\nMISMATCHED (showing first 50):`);
    for (const m of mismatches.slice(0, 50)) {
      console.log(`\n  product_id=${m.product_id}  model="${m.model}"  handle="${m.handle}"`);
      console.log(`  ${m.issue}`);
      if (m.details) console.log(m.details);
    }
    if (mismatches.length > 50) {
      console.log(`\n  ... and ${mismatches.length - 50} more`);
    }
    console.log(`\nRun with --fix to repair all mismatches.`);
  }
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    await externalDB.$disconnect();
  });
