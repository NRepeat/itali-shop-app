/**
 * Fix Ukrainian handle + title for all products (main Shopify language).
 *
 * Ukrainian is the primary locale — updates go directly via productUpdate,
 * not via translationsRegister.
 *
 * Run:
 *   npx dotenv-cli -e .env -- tsx scripts/fix-uk-products.ts
 *   npx dotenv-cli -e .env -- tsx scripts/fix-uk-products.ts --fix
 *   npx dotenv-cli -e .env -- tsx scripts/fix-uk-products.ts --sku 3DTT38-blu
 *   npx dotenv-cli -e .env -- tsx scripts/fix-uk-products.ts --sku 3DTT38-blu --fix
 *   npx dotenv-cli -e .env -- tsx scripts/fix-uk-products.ts --fix --limit 100
 */

import { PrismaClient } from "../prisma/generated/app_client/client";
import { PrismaClient as ExternalPrismaClient } from "../prisma/generated/external_client/client";
import { buildHandle, cleanTitle } from "../app/service/sync/products/build-product-input";

const prisma = new PrismaClient();
const externalDB = new ExternalPrismaClient();

const args = process.argv.slice(2);
const getArg = (flag: string) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null; };
const FIX   = args.includes("--fix");
const SKU   = getArg("--sku");
const LIMIT = getArg("--limit") ? parseInt(getArg("--limit")!, 10) : 0;
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION ?? "2025-10";
const CONCURRENCY = getArg("--concurrency") ? parseInt(getArg("--concurrency")!, 10) : 5;

// ─── Shopify helpers ──────────────────────────────────────────────────────────

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

const FIND_BY_SKU_QUERY = `
  query($q: String!) {
    products(first: 1, query: $q) {
      nodes { id handle title }
    }
  }
`;

const GET_PRODUCT_QUERY = `
  query($id: ID!) {
    product(id: $id) { id handle title }
  }
`;

const UPDATE_PRODUCT_MUTATION = `
  mutation productUpdate($input: ProductInput!) {
    productUpdate(input: $input) {
      product { id handle title }
      userErrors { field message }
    }
  }
`;

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const session = await prisma.session.findFirst({ orderBy: { id: "desc" } });
  if (!session?.accessToken || !session.shop) throw new Error("No Shopify session found");
  const { accessToken, shop } = session;

  console.log(`Shop: ${shop}  mode=${FIX ? "FIX" : "AUDIT (dry run)"}\n`);

  let products: Array<{ product_id: number; model: string; manufacturer_id: number | null }>;

  if (SKU) {
    const p = await externalDB.bc_product.findFirst({
      where: { model: SKU },
      select: { product_id: true, model: true, manufacturer_id: true },
    });
    if (!p) { console.error(`Product with SKU "${SKU}" not found`); process.exit(1); }
    products = [p];
  } else {
    products = await externalDB.bc_product.findMany({
      where: { status: true },
      select: { product_id: true, model: true, manufacturer_id: true },
      orderBy: { product_id: "asc" },
      ...(LIMIT > 0 ? { take: LIMIT } : {}),
    });
  }

  console.log(`Products to check: ${products.length}  concurrency=${CONCURRENCY}\n`);

  let ok = 0, updated = 0, skipped = 0, errors = 0;

  const processProduct = async (product: typeof products[0], idx: number): Promise<void> => {
    const prefix = `[${idx + 1}/${products.length}] ${product.product_id} (${product.model})`;
    try {
      const [ukDesc, vendor, productMap] = await Promise.all([
        externalDB.bc_product_description.findFirst({
          where: { product_id: product.product_id, language_id: 3 },
          select: { name: true, seo_keyword: true },
        }),
        product.manufacturer_id
          ? externalDB.bc_manufacturer.findUnique({
              where: { manufacturer_id: product.manufacturer_id },
              select: { name: true },
            })
          : Promise.resolve(null),
        prisma.productMap.findUnique({ where: { localProductId: product.product_id } }),
      ]);

      if (!ukDesc?.seo_keyword || !ukDesc.name) {
        console.log(`${prefix}: no UK description, skip`);
        skipped++; return;
      }

      const model = product.model.trim();
      const expectedHandle = buildHandle(ukDesc.seo_keyword, null, model, null, false);
      const expectedTitle  = cleanTitle(ukDesc.name, vendor?.name, model);

      let shopifyId = productMap?.shopifyProductId;
      let currentHandle: string | null = null;
      let currentTitle: string | null = null;

      if (shopifyId) {
        const res = await shopifyRequest<{ product: { id: string; handle: string; title: string } | null }>(
          shop, accessToken, GET_PRODUCT_QUERY, { id: shopifyId },
        );
        if (res.product) {
          currentHandle = res.product.handle;
          currentTitle  = res.product.title;
        } else {
          shopifyId = undefined;
        }
      }

      if (!shopifyId) {
        const findRes = await shopifyRequest<{ products: { nodes: Array<{ id: string; handle: string; title: string }> } }>(
          shop, accessToken, FIND_BY_SKU_QUERY, { q: `sku:${product.model}` },
        );
        const node = findRes.products?.nodes?.[0];
        if (node) { shopifyId = node.id; currentHandle = node.handle; currentTitle = node.title; }
      }

      if (!shopifyId) {
        console.log(`${prefix}: not found in Shopify, skip`);
        skipped++; return;
      }

      // Guard: skip if leading handle segments have no overlap (corrupt seo_keyword)
      const handleCorrupt = currentHandle !== null
        && (currentHandle ?? "").split("-").slice(0, 3).join("-") !== expectedHandle.split("-").slice(0, 3).join("-")
        && !currentHandle.startsWith(expectedHandle.split("-").slice(0, 2).join("-"));

      if (handleCorrupt) {
        console.log(`${prefix}: ⚠ corrupt seo_keyword, skip  "${currentHandle}" → "${expectedHandle}"`);
        skipped++; return;
      }

      // Guard: skip handle if the only difference is a color slug being removed.
      // Color slugs in handles are intentionally added by the sync worker for bound-article
      // products whose seo_keyword doesn't contain the color.
      const COLOR_SLUGS = [
        "bilij","bila","chornij","chorna","sinij","syni","sirij","sira",
        "bezhevij","bezheva","rozhevij","rozheva","zelenij","zelena",
        "chervonij","chervona","zhovtij","zhovta","fioletovij","fioletova",
        "korichnevij","korichneva","bordovij","bordova","girchichnij","girchichna",
        "pomaranchevij","pomarancheva","rudij","ruda","sriblo","zoloto",
        "bronzovij","bronzova","multikolor","m-jatnij","m-jatna","piton","haki","indigo",
      ];
      const colorPattern = new RegExp(`-(${COLOR_SLUGS.join("|")})(?=-|$)`, "g");
      const handleOnlyLosesColor = currentHandle !== null
        && currentHandle.replace(colorPattern, "") === expectedHandle.replace(colorPattern, "")
        && currentHandle !== expectedHandle
        && expectedHandle.length < currentHandle.length;

      if (handleOnlyLosesColor) {
        console.log(`${prefix}: ⚠ would remove color from handle, skip  "${currentHandle}" → "${expectedHandle}"`);
        skipped++; return;
      }

      // Guard: skip title if expected is longer (brand would be added back)
      const titleGetsLonger = currentTitle !== null && expectedTitle.length > currentTitle.length + 2;

      const handleOk = currentHandle === expectedHandle;
      const titleOk  = currentTitle === expectedTitle || titleGetsLonger;

      if (handleOk && titleOk) { ok++; return; }

      const issues: string[] = [];
      if (!handleOk) issues.push(`handle: "${currentHandle}" → "${expectedHandle}"`);
      if (!titleOk)  issues.push(`title: "${currentTitle}" → "${expectedTitle}"`);
      if (titleGetsLonger) issues.push(`⚠ title skipped`);
      console.log(`${prefix}: ${issues.join(" | ")}${FIX ? "" : " [DRY RUN]"}`);

      if (!FIX) { updated++; return; }

      const input: Record<string, unknown> = { id: shopifyId };
      if (!handleOk) input.handle = expectedHandle;
      if (!titleOk && !titleGetsLonger) input.title = expectedTitle;

      const updateRes = await shopifyRequest<{
        productUpdate: { product: { id: string } | null; userErrors: Array<{ field: string; message: string }> };
      }>(shop, accessToken, UPDATE_PRODUCT_MUTATION, { input });

      const errs = updateRes.productUpdate?.userErrors ?? [];
      if (errs.length > 0) {
        console.error(`${prefix}: ✗ ${JSON.stringify(errs)}`);
        errors++;
      } else {
        console.log(`${prefix}: ✓ updated`);
        updated++;
      }
    } catch (err: any) {
      console.error(`${prefix}: ERROR ${err.message}`);
      errors++;
    }
  };

  // Process in batches of CONCURRENCY
  for (let i = 0; i < products.length; i += CONCURRENCY) {
    const batch = products.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map((p, j) => processProduct(p, i + j)));
    if ((i + CONCURRENCY) % 500 < CONCURRENCY) {
      console.log(`  Progress: ${Math.min(i + CONCURRENCY, products.length)}/${products.length}  ok=${ok}  updated=${updated}  skipped=${skipped}  errors=${errors}`);
    }
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  RESULTS${FIX ? "" : " (DRY RUN)"}`);
  console.log("═".repeat(60));
  console.log(`  OK (already correct) : ${ok}`);
  console.log(`  ${FIX ? "Updated" : "Would update"}        : ${updated}`);
  console.log(`  Skipped              : ${skipped}`);
  console.log(`  Errors               : ${errors}`);
  if (!FIX) console.log(`\nRun with --fix to apply changes.`);
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    await externalDB.$disconnect();
  });
