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

/**
 * Removes brand slug from handle segments.
 * e.g. "kedy-zhenskie-ash-movie" + brandSlug "ash" → "kedy-zhenskie-movie"
 */
function removeBrandFromHandle(handle: string, brandSlug: string): string {
  const parts = handle.split("-");
  const filtered = parts.filter((p) => p.toLowerCase() !== brandSlug.toLowerCase());
  return filtered.join("-");
}

/**
 * Inserts colorSlug before the model slug at the end of the handle.
 * e.g. "kedy-zhenskie-movie" + colorSlug "chornij" + model "movie"
 * → "kedy-zhenskie-chornij-movie"
 */
function insertColorBeforeModel(handle: string, colorSlug: string, modelSlug: string): string {
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
 */
function buildNewHandle(
  seoKeyword: string,
  brandSlug: string | null,
  model: string,
  colorSlug: string | null,
  hasRelatedArticles: boolean,
): string {
  let handle = seoKeyword.replace(/^\//, "").trim();

  if (brandSlug) {
    handle = removeBrandFromHandle(handle, brandSlug);
  }

  // Clean up any double hyphens that might appear after removal
  handle = handle.replace(/-+/g, "-").replace(/^-|-$/g, "");

  // Color insertion disabled — add when needed
  // if (hasRelatedArticles && colorSlug) { ... }

  return handle;
}

async function getProductColorSlug(productId: number): Promise<string | null> {
  const productOptions = await externalDB.bc_product_option.findMany({
    where: { product_id: productId },
  });

  if (productOptions.length === 0) return null;

  const productOptionValues = await externalDB.bc_product_option_value.findMany({
    where: {
      product_id: productId,
      product_option_id: {
        in: productOptions.map((o) => o.product_option_id),
      },
    },
  });

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

  const colorValueDesc = await externalDB.bc_option_value_description.findFirst({
    where: {
      option_value_id: { in: colorOptionValues.map((v) => v.option_value_id) },
      language_id: 3,
    },
  });

  if (!colorValueDesc) return null;

  return colorMapping[colorValueDesc.name] ?? null;
}

export async function updateProductHandles(
  accessToken: string,
  shopDomain: string,
  limit?: number,
  offset = 0,
  dryRun = false,
): Promise<{ logs: string[]; updated: number; skipped: number; errors: number }> {
  const logs: string[] = [];
  const log = (msg: string) => {
    console.log(msg);
    logs.push(msg);
  };

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  const products = await externalDB.bc_product.findMany({
    where: { status: true, quantity: { gt: 0 } },
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
      const ukrainianDescription = await externalDB.bc_product_description.findFirst({
        where: { product_id: product.product_id, language_id: 3 },
        select: { seo_keyword: true },
      });

      if (!ukrainianDescription?.seo_keyword) {
        log(`[${i + 1}] Product ${product.product_id}: no seo_keyword, skipping`);
        skipped++;
        continue;
      }

      const vendor = product.manufacturer_id
        ? await externalDB.bc_manufacturer.findUnique({
            where: { manufacturer_id: product.manufacturer_id },
            select: { name: true },
          })
        : null;

      const brandSlug = vendor?.name ? slugifyBrand(vendor.name) : null;

      // Check if product has related articles (color variants)
      const relatedArticles = await externalDB.bc_product_related_article.findMany({
        where: { article_id: product.product_id },
        select: { product_id: true },
      });
      const hasRelatedArticles = relatedArticles.length > 0;

      let colorSlug: string | null = null;
      if (hasRelatedArticles) {
        colorSlug = await getProductColorSlug(product.product_id);
      }

      const newHandle = buildNewHandle(
        ukrainianDescription.seo_keyword,
        brandSlug,
        product.model,
        colorSlug,
        hasRelatedArticles,
      );

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
        log(`[${i + 1}] Product ${product.product_id} (${product.model}): not found in Shopify, skipping`);
        skipped++;
        continue;
      }

      if (shopifyProduct.handle === newHandle) {
        log(`[${i + 1}] Product ${product.product_id} (${product.model}): handle already correct (${newHandle}), skipping`);
        skipped++;
        continue;
      }

      log(
        `[${i + 1}] Product ${product.product_id} (${product.model}): "${shopifyProduct.handle}" → "${newHandle}"` +
          (brandSlug ? ` (brand: ${brandSlug} removed)` : "") +
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
        log(`[${i + 1}] Error updating ${product.model}: ${JSON.stringify(userErrors)}`);
        errors++;
      } else {
        log(`[${i + 1}] ✓ ${product.model} → ${newHandle}`);
        updated++;
      }
    } catch (err: any) {
      log(`[${i + 1}] Exception for product ${product.product_id}: ${err.message}`);
      errors++;
    }
  }

  log(`\n=== Summary${dryRun ? " (DRY RUN — nothing written)" : ""} ===`);
  log(`${dryRun ? "Would update" : "Updated"}: ${updated}`);
  log(`Skipped: ${skipped}`);
  log(`Errors: ${errors}`);

  return { logs, updated, skipped, errors };
}
