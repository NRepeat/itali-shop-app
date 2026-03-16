/**
 * Script: generate-product-redirects.ts
 * Run: dotenv -e .env tsx app/scripts/generate-product-redirects.ts
 *
 * Generates Cloudflare Bulk Redirects CSV for products:
 *   italishoes.com.ua/{ukr.seo_keyword} → miomio.com.ua/uk/product/{newHandle}
 *   italishoes.com.ua/{rus.seo_keyword} → miomio.com.ua/ru/product/{newHandle}
 *
 * Uses the same buildNewHandle() logic as update-product-handles.ts.
 * Output format: source_url,destination_url,301,TRUE,FALSE,FALSE,FALSE
 */

import { PrismaClient as ExternalPrismaClient } from "prisma/generated/external_client/client";
import { writeFileSync } from "fs";
import path from "path";

const externalDB = new ExternalPrismaClient();

// ─── Config ──────────────────────────────────────────────────────────────────
const OLD_DOMAIN = "https://italishoes.com.ua";
const NEW_DOMAIN = "https://www.miomio.com.ua";
const OUTPUT_FILE = path.resolve("redirects-products-generated.csv");

const LANGUAGE_ID_RU = 1;
const LANGUAGE_ID_UK = 3;
const SHOPIFY_API_VERSION = "2025-01";
// ─────────────────────────────────────────────────────────────────────────────

// ─── Shopify: load real handles by SKU ───────────────────────────────────────
async function loadShopifyHandlesBySku(
  accessToken: string,
  shopDomain: string,
): Promise<Map<string, string>> {
  const skuToHandle = new Map<string, string>();
  let cursor: string | null = null;

  console.log("Loading real handles from Shopify...");
  let page = 0;
  do {
    const variables: Record<string, unknown> = { first: 250 };
    if (cursor) variables.after = cursor;

    const query = `
      query getProducts($first: Int!, $after: String) {
        products(first: $first, after: $after) {
          pageInfo { hasNextPage endCursor }
          nodes {
            handle
            variants(first: 1) {
              nodes { sku }
            }
          }
        }
      }
    `;
    const resp = await fetch(
      `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": accessToken },
        body: JSON.stringify({ query, variables }),
      },
    );
    const json = await resp.json();
    const products = json.data?.products;
    if (!products) break;

    for (const node of products.nodes) {
      const sku = node.variants?.nodes?.[0]?.sku;
      if (sku && node.handle) skuToHandle.set(sku, node.handle);
    }

    cursor = products.pageInfo.hasNextPage ? products.pageInfo.endCursor : null;
    page++;
    if (page % 5 === 0) console.log(`  Loaded ${skuToHandle.size} handles so far...`);
  } while (cursor);

  console.log(`✓ Loaded ${skuToHandle.size} Shopify handles`);
  return skuToHandle;
}
// ─────────────────────────────────────────────────────────────────────────────

// ─── Handle logic (mirrors app/shared/handle.ts + update-product-handles.ts) ─

function sanitizeHandle(handle: string): string {
  return handle
    .replace(/[\u02BC\u2019\u2018\u0060\u00B4\u02B9\u02BB\u02BD\u02BE\u02BF]/g, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function slugifyBrand(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function removeBrandFromHandle(handle: string, brandSlug: string): string {
  const escaped = brandSlug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return handle
    .replace(new RegExp(`(?:^|-)${escaped}(?=-|$)`, "g"), "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

const colorMapping: Record<string, string> = {
  Блакитний: "blakitnij",
  Рожевий: "rozhevij",
  Фіолетовий: "fioletovij",
  Коричневий: "korichnevij",
  Гірчичний: "girchichnij",
  Бордовий: "bordovij",
  Червоний: "chervonij",
  Срібло: "sriblo",
  Зелений: "zelenij",
  Жовтий: "zhovtij",
  Хакі: "haki",
  Помаранчевий: "pomaranchevij",
  Рудий: "rudij",
  Синій: "sinij",
  Бежевий: "bezhevij",
  Чорний: "chornij",
  Білий: "bilij",
  Золото: "zoloto",
  Бронзовий: "bronzovij",
  Сірий: "sirij",
  Мультиколор: "multikolor",
  "М'ятний": "m-jatnij",
  Пітон: "piton",
};

const feminineColorSlugs = [
  "fioletova", "rozheva", "blakitna", "korichneva", "girchichna",
  "bordova", "chervona", "zelena", "zhovta", "pomarancheva",
  "ruda", "sina", "synja", "chorna", "bila", "bronzova", "sira", "m-jatna",
];

const brandAliasSlugs: Record<string, string[]> = {
  "EA7 Emporio Armani": ["ea7"],
  "Emporio Armani": ["ea7"],
};

function buildNewHandle(
  seoKeyword: string,
  brandSlug: string | null,
  model: string,
  colorSlug: string | null,
  aliasSlugs: string[] = [],
): string {
  let handle = sanitizeHandle(seoKeyword.replace(/^\//, "").trim());

  if (colorSlug) {
    const colorsToStrip = [
      ...new Set([
        ...Object.values(colorMapping),
        ...feminineColorSlugs,
        "synij", "bilyi", "chornyi",
      ]),
    ];
    for (const cs of colorsToStrip) {
      handle = removeBrandFromHandle(handle, cs);
    }
  }

  handle = handle.replace(/-+/g, "-").replace(/^-|-$/g, "");

  const modelSlug = slugifyBrand(model);
  const parts = [brandSlug, colorSlug].filter((p): p is string => Boolean(p));

  if (parts.length > 0) {
    const missingParts = parts.filter((p) => {
      const regex = new RegExp(`(?:^|-)${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=-|$)`);
      return !regex.test(handle);
    });

    if (missingParts.length > 0) {
      const lastIndex = handle.lastIndexOf(`-${modelSlug}`);
      if (lastIndex !== -1) {
        handle = handle.slice(0, lastIndex) + `-${missingParts.join("-")}-${modelSlug}`;
      }
    }
  }

  if (!handle.endsWith(`-${modelSlug}`)) {
    handle = `${handle}-${modelSlug}`;
  }

  return handle;
}

// ─────────────────────────────────────────────────────────────────────────────

async function getColorSlug(productId: number): Promise<string | null> {
  const productOptions = await externalDB.bc_product_option.findMany({
    where: { product_id: productId },
  });
  if (productOptions.length === 0) return null;

  const productOptionValues = await externalDB.bc_product_option_value.findMany({
    where: {
      product_id: productId,
      product_option_id: { in: productOptions.map((o) => o.product_option_id) },
    },
  });
  if (productOptionValues.length === 0) return null;

  const optionIds = [...new Set(productOptionValues.map((v) => v.option_id))];

  const colorOptionDesc = await externalDB.bc_option_description.findFirst({
    where: { option_id: { in: optionIds }, language_id: 3, name: "Колір" },
  });
  if (!colorOptionDesc) return null;

  const colorOptionValues = productOptionValues.filter(
    (v) => v.option_id === colorOptionDesc.option_id,
  );
  if (colorOptionValues.length === 0) return null;

  const colorValueDesc = await externalDB.bc_option_value_description.findFirst({
    where: {
      option_value_id: { in: colorOptionValues.map((v) => v.option_value_id) },
      language_id: 3,
    },
  });
  if (!colorValueDesc) return null;

  return colorMapping[colorValueDesc.name] ?? null;
}

function csvRow(source: string, destination: string): string {
  return `${source},${destination},301,TRUE,FALSE,FALSE,FALSE`;
}

async function main() {
  const { PrismaClient } = await import("prisma/generated/app_client/client");
  const prisma = new PrismaClient({ datasourceUrl: "postgres://mnmac:password@localhost:5432/mio-mio-system" });
  const session = await prisma.session.findFirst();
  await prisma.$disconnect();
  if (!session?.accessToken || !session.shop) {
    throw new Error("No Shopify session found in the database");
  }
  const { accessToken, shop: shopDomain } = session;
  console.log(`Shop: ${shopDomain}`);
  console.log(`Shop: ${shopDomain}`);

  // Load real handles from Shopify
  const shopifyHandles = await loadShopifyHandlesBySku(accessToken, shopDomain);

  console.log("Fetching products from external DB...");

  const products = await externalDB.bc_product.findMany({
    where: { status: true },
    select: { product_id: true, model: true, manufacturer_id: true },
  });

  console.log(`Found ${products.length} active products`);

  // Batch-load all descriptions
  const allDescriptions = await externalDB.bc_product_description.findMany({
    where: {
      product_id: { in: products.map((p) => p.product_id) },
      language_id: { in: [LANGUAGE_ID_UK, LANGUAGE_ID_RU] },
    },
    select: { product_id: true, language_id: true, seo_keyword: true },
  });

  const descMap = new Map<number, { uk?: string; ru?: string }>();
  for (const d of allDescriptions) {
    if (!descMap.has(d.product_id)) descMap.set(d.product_id, {});
    const entry = descMap.get(d.product_id)!;
    if (d.language_id === LANGUAGE_ID_UK && d.seo_keyword) entry.uk = d.seo_keyword.trim();
    if (d.language_id === LANGUAGE_ID_RU && d.seo_keyword) entry.ru = d.seo_keyword.trim();
  }

  // Batch-load all manufacturers
  const manufacturerIds = [...new Set(products.map((p) => p.manufacturer_id).filter(Boolean))] as number[];
  const manufacturers = await externalDB.bc_manufacturer.findMany({
    where: { manufacturer_id: { in: manufacturerIds } },
    select: { manufacturer_id: true, name: true },
  });
  const brandMap = new Map(manufacturers.map((m) => [m.manufacturer_id, m.name]));

  const rows: string[] = [];
  const seen = new Set<string>();

  const addRow = (source: string, dest: string) => {
    if (source && dest && !seen.has(source)) {
      seen.add(source);
      rows.push(csvRow(source, dest));
    }
  };

  let processed = 0;
  for (const product of products) {
    const descs = descMap.get(product.product_id);
    if (!descs?.uk) continue; // need at least UK seo_keyword

    const brandName = product.manufacturer_id ? brandMap.get(product.manufacturer_id) ?? null : null;
    const brandSlug = brandName ? slugifyBrand(brandName) : null;
    const aliasSlugs = brandName ? (brandAliasSlugs[brandName] ?? []) : [];

    // UK: use real handle from Shopify (by SKU), fallback to built handle
    const shopifyHandle = shopifyHandles.get(product.model);

    // Color requires per-product query — only needed for RU fallback
    const colorSlug = shopifyHandle ? null : await getColorSlug(product.product_id);

    const ukHandle = shopifyHandle ?? buildNewHandle(descs.uk, brandSlug, product.model, colorSlug, aliasSlugs);

    // ── UK redirect ──
    if (descs.uk) {
      addRow(
        `${OLD_DOMAIN}/${descs.uk}`,
        `${NEW_DOMAIN}/uk/product/${ukHandle}`,
      );
    }

    // ── RU redirect ── (RU handle is a Shopify translation — built from descs.ru)
    if (descs.ru) {
      const ruColorSlug = colorSlug ?? await getColorSlug(product.product_id);
      const ruHandle = buildNewHandle(descs.ru, brandSlug, product.model, ruColorSlug, aliasSlugs);
      addRow(
        `${OLD_DOMAIN}/${descs.ru}`,
        `${NEW_DOMAIN}/ru/product/${ruHandle}`,
      );
    }

    processed++;
    if (processed % 100 === 0) {
      console.log(`  Processed ${processed}/${products.length}...`);
    }
  }

  writeFileSync(OUTPUT_FILE, rows.join("\n") + "\n", "utf-8");

  console.log(`\n✓ Generated ${rows.length} product redirect rules`);
  console.log(`  Output: ${OUTPUT_FILE}`);
  console.log(`\nBreakdown:`);
  console.log(`  UK (/uk/product/*): ${rows.filter((r) => r.includes("/uk/product/")).length}`);
  console.log(`  RU (/ru/product/*): ${rows.filter((r) => r.includes("/ru/product/")).length}`);

  await externalDB.$disconnect();
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
