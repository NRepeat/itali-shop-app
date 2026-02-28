import { externalDB } from "@shared/lib/prisma/prisma.server";
import { client } from "../../sync/client/shopify";

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

// Feminine adjective forms of color slugs (for women's product seo_keywords)
const feminineColorSlugs = [
  "fioletova",
  "rozheva",
  "blakitna",
  "korichneva",
  "girchichna",
  "bordova",
  "chervona",
  "zelena",
  "zhovta",
  "pomarancheva",
  "ruda",
  "sina",
  "synja",
  "chorna",
  "bila",
  "bronzova",
  "sira",
  "m-jatna",
];

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

function slugifyBrand(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// Alias slugs to remove from handles before reinsertion (keyed by original brand name)
const brandAliasSlugs: Record<string, string[]> = {
  "EA7 Emporio Armani": ["ea7"],
  "Emporio Armani": ["ea7"],
};

/**
 * Removes brand slug from handle segments.
 * e.g. "kedy-zhenskie-ash-movie" + brandSlug "ash" → "kedy-zhenskie-movie"
 */
function removeBrandFromHandle(handle: string, brandSlug: string): string {
  const escaped = brandSlug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return handle
    .replace(new RegExp(`(?:^|-)${escaped}(?=-|$)`, "g"), "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Inserts colorSlug before the model slug at the end of the handle.
 * e.g. "kedy-zhenskie-movie" + colorSlug "chornij" + model "movie"
 * → "kedy-zhenskie-chornij-movie"
 */
function insertColorBeforeModel(
  handle: string,
  colorSlug: string,
  modelSlug: string,
): string {
  const lastIndex = handle.lastIndexOf(`-${modelSlug}`);
  if (lastIndex !== -1) {
    return handle.slice(0, lastIndex) + `-${colorSlug}-${modelSlug}`;
  }
  // Fallback: just append color before model at the end
  return `${handle}-${colorSlug}`;
}

/**
 * Build the new handle for a product:
 * 1. Remove brand slug from seo_keyword
 * 2. If has related articles → ensure color slug is in handle
 * 3. Ensure SKU (model) is appended at the end
 */
function buildNewHandle(
  seoKeyword: string,
  brandSlug: string | null,
  model: string,
  colorSlug: string | null,
  hasRelatedArticles: boolean,
  aliasSlugs: string[] = [],
): string {
  let handle = seoKeyword.replace(/^\//, "").trim();

  // if (brandSlug) {
  //   handle = removeBrandFromHandle(handle, brandSlug);
  // }
  // Also remove alias slugs (e.g. "ea7" when brand is "EA7 Emporio Armani")
  // for (const aliasSlug of aliasSlugs) {
  //   handle = removeBrandFromHandle(handle, aliasSlug);
  // }

  // When inserting a canonical color, strip all known color slugs + variants
  // to prevent duplicates from seo_keyword containing e.g. "synij" (≈ "sinij")
  if (colorSlug) {
    const colorsToStrip = [
      ...new Set([
        ...Object.values(colorMapping),
        ...feminineColorSlugs,
        "synij",
        "bilyi",
        "chornyi",
      ]),
    ];
    for (const cs of colorsToStrip) {
      handle = removeBrandFromHandle(handle, cs);
    }
  }

  // Clean up any double hyphens that might appear after removal
  handle = handle.replace(/-+/g, "-").replace(/^-|-$/g, "");

  // NEW — only inserts parts not already in the handle
  const modelSlug = slugifyBrand(model);
  const parts = [brandSlug, colorSlug].filter((p): p is string => Boolean(p));
  if (parts.length > 0) {
    const missingParts = parts.filter((p) => {
      const regex = new RegExp(
        `(?:^|-)${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=-|$)`,
      );
      return !regex.test(handle);
    });

    if (missingParts.length > 0) {
      const lastIndex = handle.lastIndexOf(`-${modelSlug}`);
      if (lastIndex !== -1) {
        handle =
          handle.slice(0, lastIndex) +
          `-${missingParts.join("-")}-${modelSlug}`;
      }
    }
  }

  // Ensure SKU (model) is at the end of the handle
  if (!handle.endsWith(`-${modelSlug}`)) {
    handle = `${handle}-${modelSlug}`;
  }

  return handle;
}

async function getProductColorSlug(productId: number): Promise<string | null> {
  const productOptions = await externalDB.bc_product_option.findMany({
    where: { product_id: productId },
  });

  if (productOptions.length === 0) return null;

  const productOptionValues = await externalDB.bc_product_option_value.findMany(
    {
      where: {
        product_id: productId,
        product_option_id: {
          in: productOptions.map((o) => o.product_option_id),
        },
      },
    },
  );

  if (productOptionValues.length === 0) return null;

  const optionIds = [...new Set(productOptionValues.map((v) => v.option_id))];

  const colorOptionDesc = await externalDB.bc_option_description.findFirst({
    where: {
      option_id: { in: optionIds },
      language_id: 3,
      name: "Колір",
    },
  });

  if (!colorOptionDesc) return null;

  const colorOptionValues = productOptionValues.filter(
    (v) => v.option_id === colorOptionDesc.option_id,
  );
  if (colorOptionValues.length === 0) return null;

  const colorValueDesc = await externalDB.bc_option_value_description.findFirst(
    {
      where: {
        option_value_id: {
          in: colorOptionValues.map((v) => v.option_value_id),
        },
        language_id: 3,
      },
    },
  );

  if (!colorValueDesc) return null;

  return colorMapping[colorValueDesc.name] ?? null;
}

export async function updateProductHandles(
  accessToken: string,
  shopDomain: string,
  limit?: number,
  offset = 0,
  dryRun = false,
): Promise<{
  logs: string[];
  updated: number;
  skipped: number;
  errors: number;
}> {
  const logs: string[] = [];
  const log = (msg: string) => {
    console.log(msg);
    logs.push(msg);
  };

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  const products = await externalDB.bc_product.findMany({
    where: { status: true },
    select: {
      product_id: true,
      model: true,
      manufacturer_id: true,
    },
    skip: offset,
    ...(limit ? { take: limit } : {}),
  });

  log(`Processing ${products.length} products (offset: ${offset})`);

  for (const [i, product] of products.entries()) {
    try {
      const ukrainianDescription =
        await externalDB.bc_product_description.findFirst({
          where: { product_id: product.product_id, language_id: 3 },
          select: { seo_keyword: true },
        });

      if (!ukrainianDescription?.seo_keyword) {
        log(
          `[${i + 1}] Product ${product.product_id}: no seo_keyword, skipping`,
        );
        skipped++;
        continue;
      }

      const vendor = product.manufacturer_id
        ? await externalDB.bc_manufacturer.findUnique({
            where: { manufacturer_id: product.manufacturer_id },
            select: { name: true },
          })
        : null;

      const brandName = vendor?.name ?? null;
      const brandSlug = brandName ? slugifyBrand(brandName) : null;
      const aliasSlugs = brandName ? (brandAliasSlugs[brandName] ?? []) : [];
      console.log(aliasSlugs, brandName);
      const colorSlug = await getProductColorSlug(product.product_id);
      const hasRelatedArticles = false; // kept for buildNewHandle signature compat

      const newHandle = buildNewHandle(
        ukrainianDescription.seo_keyword,
        brandSlug,
        product.model,
        colorSlug,
        hasRelatedArticles,
        aliasSlugs,
      );
      console.log(newHandle, brandSlug, "------------");

      // Find product in Shopify
      const shopifyResp = await client.request<{
        products: { nodes: Array<{ id: string; handle: string }> };
      }>({
        query: FIND_PRODUCT_BY_SKU_QUERY,
        variables: { query: `sku:${product.model}` },
        accessToken,
        shopDomain,
      });

      const shopifyProduct = shopifyResp.products?.nodes?.[0];

      if (!shopifyProduct) {
        log(
          `[${i + 1}] Product ${product.product_id} (${product.model}): not found in Shopify, skipping`,
        );
        skipped++;
        continue;
      }

      if (shopifyProduct.handle === newHandle) {
        log(
          `[${i + 1}] Product ${product.product_id} (${product.model}): handle already correct (${newHandle}), skipping`,
        );
        skipped++;
        continue;
      }

      log(
        `[${i + 1}] Product ${product.product_id} (${product.model}): "${shopifyProduct.handle}" → "${newHandle}"` +
          (brandSlug ? ` (brand: ${brandSlug} inserted)` : "") +
          (dryRun ? " [DRY RUN]" : ""),
      );

      if (dryRun) {
        updated++;
        continue;
      }

      // Update handle in Shopify
      const updateResp = await client.request<{
        productUpdate: {
          product: { id: string; handle: string } | null;
          userErrors: Array<{ field: string; message: string }>;
        };
      }>({
        query: UPDATE_HANDLE_MUTATION,
        variables: { input: { id: shopifyProduct.id, handle: newHandle } },
        accessToken,
        shopDomain,
      });

      const userErrors = updateResp.productUpdate?.userErrors ?? [];
      if (userErrors.length > 0) {
        log(
          `[${i + 1}] Error updating ${product.model}: ${JSON.stringify(userErrors)}`,
        );
        errors++;
      } else {
        log(`[${i + 1}] ✓ ${product.model} → ${newHandle}`);
        updated++;
      }
    } catch (err: any) {
      log(
        `[${i + 1}] Exception for product ${product.product_id}: ${err.message}`,
      );
      errors++;
    }
  }

  log(`\n=== Summary${dryRun ? " (DRY RUN — nothing written)" : ""} ===`);
  log(`${dryRun ? "Would update" : "Updated"}: ${updated}`);
  log(`Skipped: ${skipped}`);
  log(`Errors: ${errors}`);

  return { logs, updated, skipped, errors };
}

/**
 * Splits all active products into `batchCount` equal batches and runs
 * `updateProductHandles` for each batch concurrently.
 */
export async function updateProductHandlesParallel(
  accessToken: string,
  shopDomain: string,
  batchCount = 5,
  dryRun = false,
): Promise<{
  logs: string[];
  updated: number;
  skipped: number;
  errors: number;
}> {
  const total = await externalDB.bc_product.count({ where: { status: true } });
  const batchSize = Math.ceil(total / batchCount);

  const batches = Array.from({ length: batchCount }, (_, i) => ({
    offset: i * batchSize,
    limit: batchSize,
  }));

  const results = await Promise.all(
    batches.map(({ offset, limit }) =>
      updateProductHandles(accessToken, shopDomain, limit, offset, dryRun),
    ),
  );

  const allLogs: string[] = [
    `Running ${batchCount} parallel batches over ${total} products (${batchSize} each)`,
  ];
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const [i, result] of results.entries()) {
    allLogs.push(`\n--- Batch ${i + 1} ---`);
    allLogs.push(...result.logs);
    updated += result.updated;
    skipped += result.skipped;
    errors += result.errors;
  }

  allLogs.push(`\n=== Total (${batchCount} parallel batches) ===`);
  allLogs.push(`${dryRun ? "Would update" : "Updated"}: ${updated}`);
  allLogs.push(`Skipped: ${skipped}`);
  allLogs.push(`Errors: ${errors}`);

  return { logs: allLogs, updated, skipped, errors };
}