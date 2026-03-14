/**
 * Restore color slugs in handles that were incorrectly removed.
 *
 * Targets products where:
 *   - product has a color option in external DB
 *   - current Shopify handle does NOT contain that color slug
 *   - seo_keyword also does NOT contain the color (sync worker added it manually)
 *
 * Run:
 *   npx dotenv-cli -e .env -- tsx scripts/restore-color-handles.ts
 *   npx dotenv-cli -e .env -- tsx scripts/restore-color-handles.ts --fix
 *   npx dotenv-cli -e .env -- tsx scripts/restore-color-handles.ts --sku ROVER --fix
 */

import { PrismaClient } from "../prisma/generated/app_client/client";
import { PrismaClient as ExternalPrismaClient } from "../prisma/generated/external_client/client";

const prisma = new PrismaClient();
const externalDB = new ExternalPrismaClient();

const args = process.argv.slice(2);
const getArg = (flag: string) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null; };
const FIX   = args.includes("--fix");
const SKU   = getArg("--sku");
const LIMIT = getArg("--limit") ? parseInt(getArg("--limit")!, 10) : 0;
const CONCURRENCY = getArg("--concurrency") ? parseInt(getArg("--concurrency")!, 10) : 5;
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION ?? "2025-10";

// ─── Shopify ──────────────────────────────────────────────────────────────────

async function shopifyRequest<T>(
  shopDomain: string,
  accessToken: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(
    `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": accessToken },
      body: JSON.stringify({ query, variables }),
    },
  );
  const json = (await res.json()) as { data: T; errors?: unknown[] };
  if (json.errors?.length) throw new Error(`Shopify GQL error: ${JSON.stringify(json.errors)}`);
  return json.data;
}

const GET_PRODUCT_QUERY = `
  query($id: ID!) { product(id: $id) { id handle } }
`;
const FIND_BY_SKU_QUERY = `
  query($q: String!) { products(first: 1, query: $q) { nodes { id handle } } }
`;
const UPDATE_HANDLE_MUTATION = `
  mutation productUpdate($input: ProductInput!) {
    productUpdate(input: $input) {
      product { id handle }
      userErrors { field message }
    }
  }
`;

// ─── Color mapping ────────────────────────────────────────────────────────────

const colorMapping: Record<string, string> = {
  Блакитний: "blakitnij", Рожевий: "rozhevij", Фіолетовий: "fioletovij",
  Коричневий: "korichnevij", Гірчичний: "girchichnij", Бордовий: "bordovij",
  Червоний: "chervonij", Срібло: "sriblo", Зелений: "zelenij",
  Жовтий: "zhovtij", Хакі: "haki", Помаранчевий: "pomaranchevij",
  Рудий: "rudij", Синій: "sinij", Бежевий: "bezhevij", Чорний: "chornij",
  Білий: "bilij", Золото: "zoloto", Бронзовий: "bronzovij", Сірий: "sirij",
  Мультиколор: "multikolor", "М'ятний": "m-jatnij", Пітон: "piton",
};

// All known color slugs (used to check if handle already has one)
const ALL_COLOR_SLUGS = [
  ...new Set([
    ...Object.values(colorMapping),
    "bila","chorna","sina","synja","sira","rozheva","zelena","chervona",
    "zhovta","fioletova","korichneva","bordova","girchichna","pomarancheva",
    "ruda","bronzova","m-jatna","bezheva","indigo","synij","bilyi","chornyi",
  ]),
];

async function getColorSlug(productId: number): Promise<string | null> {
  const productOptions = await externalDB.bc_product_option.findMany({ where: { product_id: productId } });
  if (!productOptions.length) return null;
  const productOptionValues = await externalDB.bc_product_option_value.findMany({
    where: { product_id: productId, product_option_id: { in: productOptions.map((o) => o.product_option_id) } },
  });
  if (!productOptionValues.length) return null;
  const optionIds = [...new Set(productOptionValues.map((v) => v.option_id))];
  const colorOptionDesc = await externalDB.bc_option_description.findFirst({
    where: { option_id: { in: optionIds }, language_id: 3, name: "Колір" },
  });
  if (!colorOptionDesc) return null;
  const colorPov = productOptionValues.find((v) => v.option_id === colorOptionDesc.option_id);
  if (!colorPov) return null;
  const colorValDesc = await externalDB.bc_option_value_description.findFirst({
    where: { option_value_id: colorPov.option_value_id, language_id: 3 },
  });
  return colorValDesc ? (colorMapping[colorValDesc.name] ?? null) : null;
}

function slugify(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Insert colorSlug before modelSlug at the end of handle. */
function insertColor(handle: string, colorSlug: string, modelSlug: string): string {
  const suffix = `-${modelSlug}`;
  if (handle.endsWith(suffix)) {
    return handle.slice(0, handle.length - suffix.length) + `-${colorSlug}${suffix}`;
  }
  return `${handle}-${colorSlug}`;
}

/** Returns true if handle already contains this color slug as a segment. */
function handleHasColor(handle: string, colorSlug: string): boolean {
  return new RegExp(`(?:^|-)${colorSlug}(?=-|$)`).test(handle);
}

/** Returns true if handle contains ANY known color slug. */
function handleHasAnyColor(handle: string): boolean {
  return ALL_COLOR_SLUGS.some((c) => handleHasColor(handle, c));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const session = await prisma.session.findFirst({ orderBy: { id: "desc" } });
  if (!session?.accessToken || !session.shop) throw new Error("No Shopify session found");
  const { accessToken, shop } = session;

  console.log(`Shop: ${shop}  mode=${FIX ? "FIX" : "AUDIT (dry run)"}  concurrency=${CONCURRENCY}\n`);

  let products: Array<{ product_id: number; model: string }>;

  if (SKU) {
    const p = await externalDB.bc_product.findFirst({
      where: { model: SKU },
      select: { product_id: true, model: true },
    });
    if (!p) { console.error(`SKU "${SKU}" not found`); process.exit(1); }
    products = [p];
  } else {
    products = await externalDB.bc_product.findMany({
      where: { status: true },
      select: { product_id: true, model: true },
      orderBy: { product_id: "asc" },
      ...(LIMIT > 0 ? { take: LIMIT } : {}),
    });
  }

  console.log(`Products to check: ${products.length}\n`);

  let ok = 0, restored = 0, skipped = 0, errors = 0;

  const processProduct = async (product: typeof products[0], idx: number): Promise<void> => {
    const prefix = `[${idx + 1}/${products.length}] ${product.product_id} (${product.model})`;
    try {
      const colorSlug = await getColorSlug(product.product_id);
      if (!colorSlug) { ok++; return; } // no color option → nothing to restore

      // Get seo_keyword to check if color is already there
      const ukDesc = await externalDB.bc_product_description.findFirst({
        where: { product_id: product.product_id, language_id: 3 },
        select: { seo_keyword: true },
      });

      // If seo_keyword already contains the color, the main fix script handles it — skip here
      if (ukDesc?.seo_keyword && handleHasColor(ukDesc.seo_keyword, colorSlug)) {
        ok++; return;
      }

      // Find Shopify product
      const productMap = await prisma.productMap.findUnique({ where: { localProductId: product.product_id } });
      let shopifyId = productMap?.shopifyProductId;
      let currentHandle: string | null = null;

      if (shopifyId) {
        const res = await shopifyRequest<{ product: { id: string; handle: string } | null }>(
          shop, accessToken, GET_PRODUCT_QUERY, { id: shopifyId },
        );
        if (res.product) {
          currentHandle = res.product.handle;
        } else {
          shopifyId = undefined;
        }
      }

      if (!shopifyId) {
        const findRes = await shopifyRequest<{ products: { nodes: Array<{ id: string; handle: string }> } }>(
          shop, accessToken, FIND_BY_SKU_QUERY, { q: `sku:${product.model}` },
        );
        const node = findRes.products?.nodes?.[0];
        if (node) { shopifyId = node.id; currentHandle = node.handle; }
      }

      if (!shopifyId || !currentHandle) {
        skipped++; return;
      }

      // If handle already has this color (or any color) → already correct
      if (handleHasColor(currentHandle, colorSlug)) {
        ok++; return;
      }

      // If handle has a DIFFERENT color, don't touch it
      if (handleHasAnyColor(currentHandle)) {
        ok++; return;
      }

      // Handle is missing the color — restore it
      const modelSlug = slugify(product.model.trim());
      const restoredHandle = insertColor(currentHandle, colorSlug, modelSlug);

      console.log(`${prefix}: "${currentHandle}" → "${restoredHandle}"${FIX ? "" : " [DRY RUN]"}`);

      if (!FIX) { restored++; return; }

      const updateRes = await shopifyRequest<{
        productUpdate: { product: { id: string } | null; userErrors: Array<{ field: string; message: string }> };
      }>(shop, accessToken, UPDATE_HANDLE_MUTATION, { input: { id: shopifyId, handle: restoredHandle } });

      const errs = updateRes.productUpdate?.userErrors ?? [];
      if (errs.length > 0) {
        console.error(`${prefix}: ✗ ${JSON.stringify(errs)}`);
        errors++;
      } else {
        console.log(`${prefix}: ✓ restored`);
        restored++;
      }
    } catch (err: any) {
      console.error(`${prefix}: ERROR ${err.message}`);
      errors++;
    }
  };

  for (let i = 0; i < products.length; i += CONCURRENCY) {
    const batch = products.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map((p, j) => processProduct(p, i + j)));
    if (i > 0 && i % 500 < CONCURRENCY) {
      console.log(`  Progress: ${i}/${products.length}  ok=${ok}  restored=${restored}  errors=${errors}`);
    }
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  RESULTS${FIX ? "" : " (DRY RUN)"}`);
  console.log("═".repeat(60));
  console.log(`  OK / no change : ${ok}`);
  console.log(`  ${FIX ? "Restored" : "Would restore"} : ${restored}`);
  console.log(`  Skipped        : ${skipped}`);
  console.log(`  Errors         : ${errors}`);
  if (!FIX) console.log(`\nRun with --fix to apply.`);
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    await externalDB.$disconnect();
  });
