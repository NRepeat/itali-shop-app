/**
 * Script: fix-handles.ts
 * Run: dotenv -e .env tsx app/scripts/fix-handles.ts
 *
 * Updates Shopify product handles:
 * - Removes brand slug from handle
 * - Adds color slug if product has related articles (color variants)
 */

import { PrismaClient } from "prisma/generated/app_client/client";
import { PrismaClient as ExternalPrismaClient } from "prisma/generated/external_client/client";

const prisma = new PrismaClient();
const externalDB = new ExternalPrismaClient();

const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION ?? "2025-10";

// ─── Config ──────────────────────────────────────────────────────────────────
// DRY_RUN = true → only shows changes, does NOT update Shopify
const DRY_RUN = true;
// Adjust LIMIT to process a subset for testing; set to 0 to process all.
const LIMIT = 20;
const OFFSET = 0;
// ─────────────────────────────────────────────────────────────────────────────

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
  Бежевий: "bilij",
  Чорний: "chornij",
  Білий: "bilij",
  Золото: "zoloto",
  Бронзовий: "bronzovij",
  Сірий: "sirij",
  Мультиколор: "multikolor",
  "М'ятний": "m-jatnij",
  Пітон: "piton",
};

const UPDATE_HANDLE_MUTATION = `
  mutation productUpdate($input: ProductInput!) {
    productUpdate(input: $input) {
      product {
        id
        handle
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const FIND_PRODUCT_BY_SKU_QUERY = `
  query findProductBySku($query: String!) {
    products(first: 1, query: $query) {
      nodes {
        id
        handle
      }
    }
  }
`;

async function shopifyRequest<T>(
  shopDomain: string,
  accessToken: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(
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
  const result = (await response.json()) as { data: T; errors?: unknown[] };
  if (result.errors?.length) {
    throw new Error(`Shopify GQL error: ${JSON.stringify(result.errors)}`);
  }
  return result.data;
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
  const parts = handle.split("-");
  const filtered = parts.filter((p) => p.toLowerCase() !== brandSlug.toLowerCase());
  return filtered.join("-");
}

function buildHandle(
  seoKeyword: string,
  brandName: string | null | undefined,
  model: string,
  colorSlug: string | null | undefined,
  hasRelatedArticles: boolean,
): string {
  let handle = seoKeyword.replace(/^\//, "").trim();

  if (brandName) {
    const brandSlug = slugifyBrand(brandName);
    if (brandSlug) {
      handle = removeBrandFromHandle(handle, brandSlug);
    }
  }

  handle = handle.replace(/-+/g, "-").replace(/^-|-$/g, "");

  // Color insertion disabled — add when needed
  // if (hasRelatedArticles && colorSlug && !handle.includes(colorSlug)) { ... }

  return handle;
}

async function getColorSlug(productId: number): Promise<string | null> {
  const productOptions = await externalDB.bc_product_option.findMany({
    where: { product_id: productId },
  });
  if (!productOptions.length) return null;

  const productOptionValues = await externalDB.bc_product_option_value.findMany({
    where: {
      product_id: productId,
      product_option_id: { in: productOptions.map((o) => o.product_option_id) },
    },
  });
  if (!productOptionValues.length) return null;

  const optionIds = [...new Set(productOptionValues.map((v) => v.option_id))];

  const colorOption = await externalDB.bc_option_description.findFirst({
    where: { option_id: { in: optionIds }, language_id: 3, name: "Колір" },
  });
  if (!colorOption) return null;

  const colorPov = productOptionValues.find((v) => v.option_id === colorOption.option_id);
  if (!colorPov) return null;

  const colorValDesc = await externalDB.bc_option_value_description.findFirst({
    where: { option_value_id: colorPov.option_value_id, language_id: 3 },
  });
  if (!colorValDesc) return null;

  return colorMapping[colorValDesc.name] ?? null;
}

async function main() {
  console.log("=== Fix Product Handles ===\n");

  const session = await prisma.session.findFirst();
  if (!session?.accessToken || !session.shop) {
    throw new Error("No Shopify session found in the database");
  }
  const { accessToken, shop: shopDomain } = session;
  console.log(`Shop: ${shopDomain}\n`);

  const products = await externalDB.bc_product.findMany({
    where: { status: true, quantity: { gt: 0 } },
    select: { product_id: true, model: true, manufacturer_id: true },
    skip: OFFSET,
    ...(LIMIT > 0 ? { take: LIMIT } : {}),
  });

  console.log(`Found ${products.length} products to process\n`);

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const [i, product] of products.entries()) {
    const prefix = `[${i + 1}/${products.length}] ${product.product_id} (${product.model})`;
    try {
      const ukDesc = await externalDB.bc_product_description.findFirst({
        where: { product_id: product.product_id, language_id: 3 },
        select: { seo_keyword: true },
      });

      if (!ukDesc?.seo_keyword) {
        console.log(`${prefix}: no seo_keyword, skip`);
        skipped++;
        continue;
      }

      const vendor = product.manufacturer_id
        ? await externalDB.bc_manufacturer.findUnique({
            where: { manufacturer_id: product.manufacturer_id },
            select: { name: true },
          })
        : null;

      const relatedArticles = await externalDB.bc_product_related_article.findMany({
        where: { article_id: product.product_id },
        select: { product_id: true },
      });
      const hasRelatedArticles = relatedArticles.length > 0;

      const colorSlug = hasRelatedArticles ? await getColorSlug(product.product_id) : null;

      const newHandle = buildHandle(
        ukDesc.seo_keyword,
        vendor?.name,
        product.model,
        colorSlug,
        hasRelatedArticles,
      );

      if (DRY_RUN) {
        const oldHandle = ukDesc.seo_keyword.replace(/^\//, "").trim();
        if (oldHandle === newHandle) {
          // No change — skip silently unless you want to see all
          skipped++;
        } else {
          console.log(
            `${prefix}: "${oldHandle}" → "${newHandle}"` +
              (vendor?.name ? ` [brand: ${slugifyBrand(vendor.name)} removed]` : "") +
              (hasRelatedArticles && colorSlug ? ` [color: ${colorSlug}]` : ""),
          );
          updated++;
        }
        continue;
      }

      // Find in Shopify
      const findResp = await shopifyRequest<{
        products: { nodes: Array<{ id: string; handle: string }> };
      }>(shopDomain, accessToken, FIND_PRODUCT_BY_SKU_QUERY, { query: `sku:${product.model}` });

      const shopifyProduct = findResp.products?.nodes?.[0];
      if (!shopifyProduct) {
        console.log(`${prefix}: not found in Shopify, skip`);
        skipped++;
        continue;
      }

      if (shopifyProduct.handle === newHandle) {
        console.log(`${prefix}: already correct (${newHandle}), skip`);
        skipped++;
        continue;
      }

      console.log(
        `${prefix}: "${shopifyProduct.handle}" → "${newHandle}"` +
          (vendor?.name ? ` [brand: ${slugifyBrand(vendor.name)} removed]` : "") +
          (hasRelatedArticles && colorSlug ? ` [color: ${colorSlug}]` : ""),
      );

      const updateResp = await shopifyRequest<{
        productUpdate: {
          product: { id: string; handle: string } | null;
          userErrors: Array<{ field: string; message: string }>;
        };
      }>(shopDomain, accessToken, UPDATE_HANDLE_MUTATION, {
        input: { id: shopifyProduct.id, handle: newHandle },
      });

      const errs = updateResp.productUpdate?.userErrors ?? [];
      if (errs.length > 0) {
        console.error(`${prefix}: Shopify errors: ${JSON.stringify(errs)}`);
        errors++;
      } else {
        console.log(`${prefix}: ✓ updated`);
        updated++;
      }

      // Small delay to avoid Shopify rate limits
      await new Promise((r) => setTimeout(r, 200));
    } catch (err: any) {
      console.error(`${prefix}: ERROR ${err.message}`);
      errors++;
    }
  }

  console.log(`\n=== Summary ${DRY_RUN ? "(DRY RUN — nothing written)" : ""} ===`);
  console.log(`${DRY_RUN ? "Would update" : "Updated"} : ${updated}`);
  console.log(`Skipped : ${skipped}`);
  console.log(`Errors  : ${errors}`);

  await prisma.$disconnect();
  await externalDB.$disconnect();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
