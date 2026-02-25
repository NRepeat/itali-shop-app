import { externalDB } from "@shared/lib/prisma/prisma.server";
import { client } from "../../sync/client/shopify";
import { cleanTitle } from "./build-product-input";

const FIND_PRODUCT_BY_SKU_QUERY = `
  query findProductBySku($query: String!) {
    products(first: 1, query: $query) {
      nodes {
        id
        title
      }
    }
  }
`;

const UPDATE_TITLE_MUTATION = `
  mutation productUpdate($input: ProductInput!) {
    productUpdate(input: $input) {
      product {
        id
        title
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export async function updateProductTitles(
  accessToken: string,
  shopDomain: string,
  limit?: number,
  offset = 0,
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
    where: { status: true, manufacturer_id: 131, model: "3DPT10біла" },
    select: {
      product_id: true,
      model: true,
      sku: true,
      manufacturer_id: true,
    },
    skip: offset,
    ...(limit ? { take: limit } : {}),
  });

  log(`Processing ${products.length} products (offset: ${offset})`);

  for (const [i, product] of products.entries()) {
    try {
      const description = await externalDB.bc_product_description.findFirst({
        where: { product_id: product.product_id, language_id: 3 },
        select: { name: true },
      });

      if (!description?.name) {
        log(
          `[${i + 1}] Product ${product.product_id}: no description name, skipping`,
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

      let newTitle = cleanTitle(description.name, vendor?.name, product.model);
      if (
        product.sku &&
        product.sku !== product.model &&
        /\d/.test(product.sku)
      ) {
        newTitle = cleanTitle(newTitle, null, product.sku);
      }

      // Find product in Shopify
      const shopifyResp = await client.request<
        { products: { nodes: Array<{ id: string; title: string }> } },
        { query: string }
      >({
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
      console.log("newTitle",newTitle,shopifyProduct)

      if (shopifyProduct.title === newTitle) {
        log(
          `[${i + 1}] Product ${product.product_id} (${product.model}): title already correct, skipping`,
        );
        skipped++;
        continue;
      }

      log(
        `[${i + 1}] Product ${product.product_id} (${product.model}): "${shopifyProduct.title}" → "${newTitle}"`,
      );

      // Update title in Shopify
      const updateResp = await client.request<
        {
          productUpdate: {
            product: { id: string; title: string } | null;
            userErrors: Array<{ field: string; message: string }>;
          };
        },
        { input: { id: string; title: string } }
      >({
        query: UPDATE_TITLE_MUTATION,
        variables: { input: { id: shopifyProduct.id, title: newTitle } },
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
        log(`[${i + 1}] ✓ ${product.model} → "${newTitle}"`);
        updated++;
      }
    } catch (err: any) {
      log(
        `[${i + 1}] Exception for product ${product.product_id}: ${err.message}`,
      );
      errors++;
    }
  }

  log(`\n=== Summary ===`);
  log(`Updated: ${updated}`);
  log(`Skipped: ${skipped}`);
  log(`Errors: ${errors}`);

  return { logs, updated, skipped, errors };
}

/**
 * Splits all active products into `batchCount` equal batches and runs
 * `updateProductTitles` for each batch concurrently.
 */
export async function updateProductTitlesParallel(
  accessToken: string,
  shopDomain: string,
  batchCount = 10,
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
      updateProductTitles(accessToken, shopDomain, limit, offset),
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
  allLogs.push(`Updated: ${updated}`);
  allLogs.push(`Skipped: ${skipped}`);
  allLogs.push(`Errors: ${errors}`);

  return { logs: allLogs, updated, skipped, errors };
}
