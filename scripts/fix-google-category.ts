/**
 * Fix Google product category mismatch.
 *
 * Products in the TSV export have Google category 352 (Clothing & Accessories > Clothing)
 * but should have 187 (Apparel & Accessories > Shoes) via Shopify taxonomy category aa-8.
 *
 * This script reads product IDs from the TSV, checks their current category in Shopify,
 * and updates them to gid://shopify/TaxonomyCategory/aa-8.
 *
 * Run:
 *   npx dotenv-cli -e .env -- tsx scripts/fix-google-category.ts
 *   npx dotenv-cli -e .env -- tsx scripts/fix-google-category.ts --fix
 */

import { PrismaClient } from "../prisma/generated/app_client/client";
const prisma = new PrismaClient();

const args = process.argv.slice(2);
const FIX = args.includes("--fix");

const TARGET_CATEGORY = "gid://shopify/TaxonomyCategory/aa-8";
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION ?? "2025-10";

// Product IDs from products_2026-03-30_09-37-07.tsv (google category 352 → should be 187)
const PRODUCT_IDS = [
  "8922245824674",
  "8922179174562",
  "8922284097698",
  "8922179403938",
  "8927734104226",
  "8922361462946",
  "8922294943906",
  "8922488406178",
  "8922461470882",
  "8922232783010",
  "8946529271970",
  "8922469105826",
  "8922405699746",
];

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
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({ query, variables }),
    },
  );
  const json = (await res.json()) as { data: T; errors?: unknown[] };
  if (json.errors?.length)
    throw new Error(`Shopify GQL error: ${JSON.stringify(json.errors)}`);
  return json.data;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

const GET_PRODUCT_CATEGORY_QUERY = `
  query($id: ID!) {
    product(id: $id) {
      id
      title
      category {
        id
        fullName
      }
    }
  }
`;

const UPDATE_PRODUCT_CATEGORY_MUTATION = `
  mutation productUpdate($input: ProductInput!) {
    productUpdate(input: $input) {
      product {
        id
        title
        category {
          id
          fullName
        }
      }
      userErrors { field message }
    }
  }
`;

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const session = await prisma.session.findFirst({ orderBy: { id: "desc" } });
  if (!session?.accessToken || !session.shop)
    throw new Error("No Shopify session found");
  const { accessToken, shop } = session;

  console.log(`Shop: ${shop}  mode=${FIX ? "FIX" : "AUDIT (dry run)"}`);
  console.log(`Target category: ${TARGET_CATEGORY}`);
  console.log(`Products to fix: ${PRODUCT_IDS.length}\n`);

  const productIds = PRODUCT_IDS;

  let ok = 0,
    updated = 0,
    skipped = 0,
    errors = 0;

  for (let i = 0; i < productIds.length; i++) {
    const numericId = productIds[i];
    const shopifyGid = `gid://shopify/Product/${numericId}`;
    const prefix = `[${i + 1}/${productIds.length}] ${numericId}`;

    try {
      const res = await shopifyRequest<{
        product: {
          id: string;
          title: string;
          category: { id: string; fullName: string } | null;
        } | null;
      }>(shop, accessToken, GET_PRODUCT_CATEGORY_QUERY, { id: shopifyGid });

      if (!res.product) {
        console.log(`${prefix}: not found in Shopify, skip`);
        skipped++;
        continue;
      }

      const current = res.product.category;
      const title = res.product.title;

      if (current?.id === TARGET_CATEGORY) {
        console.log(`${prefix}: ${title} — already correct (${current.fullName})`);
        ok++;
        continue;
      }

      console.log(
        `${prefix}: ${title} — ${current?.id ?? "none"} (${current?.fullName ?? "no category"}) → ${TARGET_CATEGORY}${FIX ? "" : " [DRY RUN]"}`,
      );

      if (!FIX) {
        updated++;
        continue;
      }

      const updateRes = await shopifyRequest<{
        productUpdate: {
          product: { id: string; category: { id: string; fullName: string } | null } | null;
          userErrors: Array<{ field: string; message: string }>;
        };
      }>(shop, accessToken, UPDATE_PRODUCT_CATEGORY_MUTATION, {
        input: { id: shopifyGid, category: TARGET_CATEGORY },
      });

      const errs = updateRes.productUpdate?.userErrors ?? [];
      if (errs.length > 0) {
        console.error(`${prefix}: ✗ ${JSON.stringify(errs)}`);
        errors++;
      } else {
        const newCat = updateRes.productUpdate?.product?.category;
        console.log(`${prefix}: ✓ updated → ${newCat?.fullName ?? "unknown"}`);
        updated++;
      }
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
  });
