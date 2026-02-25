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
      const description = await externalDB.bc_product_description.findFirst({
        where: { product_id: product.product_id, language_id: 3 },
        select: { name: true },
      });

      if (!description?.name) {
        log(`[${i + 1}] Product ${product.product_id}: no description name, skipping`);
        skipped++;
        continue;
      }

      const vendor = product.manufacturer_id
        ? await externalDB.bc_manufacturer.findUnique({
            where: { manufacturer_id: product.manufacturer_id },
            select: { name: true },
          })
        : null;

      const newTitle = cleanTitle(description.name, vendor?.name, product.model);

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
        log(`[${i + 1}] Product ${product.product_id} (${product.model}): not found in Shopify, skipping`);
        skipped++;
        continue;
      }

      if (shopifyProduct.title === newTitle) {
        log(`[${i + 1}] Product ${product.product_id} (${product.model}): title already correct, skipping`);
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
        log(`[${i + 1}] Error updating ${product.model}: ${JSON.stringify(userErrors)}`);
        errors++;
      } else {
        log(`[${i + 1}] ✓ ${product.model} → "${newTitle}"`);
        updated++;
      }
    } catch (err: any) {
      log(`[${i + 1}] Exception for product ${product.product_id}: ${err.message}`);
      errors++;
    }
  }

  log(`\n=== Summary ===`);
  log(`Updated: ${updated}`);
  log(`Skipped: ${skipped}`);
  log(`Errors: ${errors}`);

  return { logs, updated, skipped, errors };
}
