/**
 * Fix Russian (locale "ru") handle + title translations for all products.
 *
 * Uses the same buildHandle / cleanTitle logic as the main sync worker.
 *
 * Run:
 *   npx dotenv-cli -e .env -- tsx scripts/fix-ru-translations.ts
 *   npx dotenv-cli -e .env -- tsx scripts/fix-ru-translations.ts --fix
 *   npx dotenv-cli -e .env -- tsx scripts/fix-ru-translations.ts --sku 3DTT38-blu
 *   npx dotenv-cli -e .env -- tsx scripts/fix-ru-translations.ts --sku 3DTT38-blu --fix
 *   npx dotenv-cli -e .env -- tsx scripts/fix-ru-translations.ts --fix --limit 100
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
      nodes { id handle }
    }
  }
`;

const GET_TRANSLATABLE_QUERY = `
  query($id: ID!) {
    translatableResource(resourceId: $id) {
      translatableContent { key digest value }
      translations(locale: "ru") { key value }
    }
  }
`;

const TRANSLATIONS_REGISTER_MUTATION = `
  mutation translationsRegister($resourceId: ID!, $translations: [TranslationInput!]!) {
    translationsRegister(resourceId: $resourceId, translations: $translations) {
      userErrors { field message }
      translations { key value }
    }
  }
`;

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const session = await prisma.session.findFirst({ orderBy: { id: "desc" } });
  if (!session?.accessToken || !session.shop) throw new Error("No Shopify session found");
  const { accessToken, shop } = session;

  console.log(`Shop: ${shop}  mode=${FIX ? "FIX" : "AUDIT (dry run)"}\n`);

  // Fetch products
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

  console.log(`Products to check: ${products.length}\n`);

  let ok = 0, updated = 0, skipped = 0, errors = 0;

  for (const [i, product] of products.entries()) {
    const prefix = `[${i + 1}/${products.length}] ${product.product_id} (${product.model})`;

    try {
      // Get Russian description
      const ruDesc = await externalDB.bc_product_description.findFirst({
        where: { product_id: product.product_id, language_id: 1 },
        select: { name: true, seo_keyword: true },
      });

      if (!ruDesc?.seo_keyword || !ruDesc.name) {
        console.log(`${prefix}: no RU description, skip`);
        skipped++;
        continue;
      }

      const vendor = product.manufacturer_id
        ? await externalDB.bc_manufacturer.findUnique({
            where: { manufacturer_id: product.manufacturer_id },
            select: { name: true },
          })
        : null;

      const model = product.model.trim();
      // Pass null for brand and color: seo_keyword already has both embedded correctly.
      // Re-computing colorSlug picks wrong color when DB order changed vs original sync.
      const expectedHandle = buildHandle(ruDesc.seo_keyword, null, model, null, false);
      const expectedTitle  = cleanTitle(ruDesc.name, vendor?.name, model);

      // Find in Shopify
      const productMap = await prisma.productMap.findUnique({ where: { localProductId: product.product_id } });
      let shopifyId = productMap?.shopifyProductId;

      if (!shopifyId) {
        const findRes = await shopifyRequest<{ products: { nodes: Array<{ id: string }> } }>(
          shop, accessToken, FIND_BY_SKU_QUERY, { q: `sku:${product.model}` },
        );
        shopifyId = findRes.products?.nodes?.[0]?.id;
      }

      if (!shopifyId) {
        console.log(`${prefix}: not found in Shopify, skip`);
        skipped++;
        continue;
      }

      // Fetch current RU translations + digests
      const transRes = await shopifyRequest<{
        translatableResource: {
          translatableContent: Array<{ key: string; digest: string; value: string }>;
          translations: Array<{ key: string; value: string }>;
        };
      }>(shop, accessToken, GET_TRANSLATABLE_QUERY, { id: shopifyId });

      const digests     = transRes.translatableResource?.translatableContent ?? [];
      const currentRu   = transRes.translatableResource?.translations ?? [];
      const currentHandle = currentRu.find((t) => t.key === "handle")?.value ?? null;
      const currentTitle  = currentRu.find((t) => t.key === "title")?.value ?? null;

      const handleOk = currentHandle === expectedHandle;
      const titleOk  = currentTitle === expectedTitle;

      if (handleOk && titleOk) {
        ok++;
        continue;
      }

      const issues: string[] = [];
      if (!handleOk) issues.push(`handle: "${currentHandle}" → "${expectedHandle}"`);
      if (!titleOk)  issues.push(`title: "${currentTitle}" → "${expectedTitle}"`);
      console.log(`${prefix}: ${issues.join(" | ")}${FIX ? "" : " [DRY RUN]"}`);

      if (!FIX) {
        updated++;
        continue;
      }

      // Build translations to register
      const toRegister: Array<{ locale: string; key: string; value: string; translatableContentDigest: string }> = [];

      if (!handleOk) {
        const d = digests.find((d) => d.key === "handle");
        if (d) toRegister.push({ locale: "ru", key: "handle", value: expectedHandle, translatableContentDigest: d.digest });
      }
      if (!titleOk) {
        const d = digests.find((d) => d.key === "title");
        if (d) toRegister.push({ locale: "ru", key: "title", value: expectedTitle, translatableContentDigest: d.digest });
      }

      if (toRegister.length === 0) {
        console.log(`${prefix}: ⚠ no digests found, skip`);
        skipped++;
        continue;
      }

      const regRes = await shopifyRequest<{
        translationsRegister: { userErrors: Array<{ field: string; message: string }> };
      }>(shop, accessToken, TRANSLATIONS_REGISTER_MUTATION, {
        resourceId: shopifyId,
        translations: toRegister,
      });

      const errs = regRes.translationsRegister?.userErrors ?? [];
      if (errs.length > 0) {
        console.error(`${prefix}: ✗ ${JSON.stringify(errs)}`);
        errors++;
      } else {
        console.log(`${prefix}: ✓ updated`);
        updated++;
      }

      await new Promise((r) => setTimeout(r, 150));
    } catch (err: any) {
      console.error(`${prefix}: ERROR ${err.message}`);
      errors++;
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
