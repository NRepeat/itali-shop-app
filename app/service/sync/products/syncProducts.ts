import { externalDB, prisma } from "@shared/lib/prisma/prisma.server";
import { processSyncTask } from "./sync-product.worker";
import { client } from "@shared/lib/shopify/client/client";
import { findShopifyProductBySku } from "@/service/shopify/products/api/find-shopify-product";

const LOCATION_ID = process.env.SHOPIFY_LOCATION || "gid://shopify/Location/78249492642";

const GET_PRODUCT_VARIANTS_FOR_ZERO = `
  query getVariantsForZero($id: ID!) {
    product(id: $id) {
      variants(first: 100) {
        nodes { inventoryItem { id } }
      }
    }
  }
`;

const INVENTORY_SET_QUANTITIES_MUTATION = `
  mutation inventorySetQuantities($input: InventorySetQuantitiesInput!) {
    inventorySetQuantities(input: $input) {
      inventoryAdjustmentGroup { reason }
      userErrors { field message }
    }
  }
`;

/**
 * For sold-out products: only zero-out inventory in Shopify, don't touch product data.
 */
async function zeroOutShopifyInventory(
  shopifyProductId: string,
  accessToken: string,
  shopDomain: string,
  log: (msg: string) => void,
): Promise<void> {
  const varRes = await client.request<{ product: { variants: { nodes: Array<{ inventoryItem: { id: string } }> } } | null }>({
    query: GET_PRODUCT_VARIANTS_FOR_ZERO,
    variables: { id: shopifyProductId },
    accessToken,
    shopDomain,
  });

  const inventoryItemIds = varRes.product?.variants?.nodes?.map((v) => v.inventoryItem.id) ?? [];
  if (inventoryItemIds.length === 0) {
    log(`  [ZeroOut] No variants found for ${shopifyProductId}`);
    return;
  }

  const invRes = await client.request<{ inventorySetQuantities: { userErrors: Array<{ message: string }> } }>({
    query: INVENTORY_SET_QUANTITIES_MUTATION,
    variables: {
      input: {
        name: "available",
        reason: "correction",
        quantities: inventoryItemIds.map((inventoryItemId) => ({
          inventoryItemId,
          locationId: LOCATION_ID,
          quantity: 0,
        })),
      },
    },
    accessToken,
    shopDomain,
  });

  const errors = invRes.inventorySetQuantities?.userErrors ?? [];
  if (errors.length > 0) {
    log(`  [ZeroOut] Errors: ${errors.map((e) => e.message).join(", ")}`);
  } else {
    log(`  [ZeroOut] Set ${inventoryItemIds.length} variants to qty=0`);
  }
}

const PRODUCT_SELECT = {
  product_id: true, model: true, sku: true, upc: true, ean: true,
  jan: true, isbn: true, mpn: true, location: true, quantity: true,
  stock_status_id: true, image: true, manufacturer_id: true, shipping: true,
  price: true, points: true, tax_class_id: true, weight: true,
  weight_class_id: true, length: true, width: true, height: true,
  length_class_id: true, subtract: true, minimum: true, sort_order: true,
  status: true, viewed: true, noindex: true, af_values: true, af_tags: true,
  extra_special: true, import_batch: true, meta_robots: true,
  seo_canonical: true, new: true, rasprodaja: true,
} as const;

export const syncProducts = async (
  domain: string,
  accessToken: string,
  limit?: number,
  forceProductSet?: boolean,
  since?: Date,
) => {
  const logs: string[] = [];
  const log = (msg: string) => {
    console.log(msg);
    logs.push(msg);
  };
  try {
    const allProducts = await externalDB.bc_product.findMany({
      where: {
        status: true,
        quantity: { gt: 0 },
        ...(since ? { date_modified: { gte: since } } : {}),
      },
      orderBy: { product_id: "desc" },
      select: PRODUCT_SELECT,
    });
    log(`Found ${allProducts.length} in-stock products`);

    // When doing a since-based sync, also handle products that just sold out (qty=0)
    // but DON'T do a full productSet — only zero-out their inventory in Shopify
    if (since) {
      const soldOutProducts = await externalDB.bc_product.findMany({
        where: {
          status: true,
          quantity: 0,
          date_modified: { gte: since },
        },
        orderBy: { product_id: "desc" },
        select: { product_id: true, model: true },
      });

      if (soldOutProducts.length > 0) {
        log(`Found ${soldOutProducts.length} sold-out products to zero-out in Shopify`);
        const CONCURRENCY = 5;
        for (let i = 0; i < soldOutProducts.length; i += CONCURRENCY) {
          const batch = soldOutProducts.slice(i, i + CONCURRENCY);
          await Promise.all(
            batch.map(async (product) => {
              try {
                const shopifyId = await findShopifyProductBySku(product.model, accessToken, domain);
                if (!shopifyId) {
                  log(`  [ZeroOut] ${product.model} not found in Shopify, skipping`);
                  return;
                }
                log(`  [ZeroOut] Zeroing out ${product.model} (${shopifyId})`);
                await zeroOutShopifyInventory(shopifyId, accessToken, domain, log);
              } catch (e: any) {
                log(`  [ZeroOut] Error for ${product.model}: ${e.message}`);
              }
            }),
          );
        }
      }
    }

    const productsToSync = limit ? allProducts.slice(0, limit) : allProducts;
    log(`Syncing ${productsToSync.length} in-stock products${limit ? ` (limited to ${limit})` : ""}`);

    const CONCURRENCY = 5;
    for (let i = 0; i < productsToSync.length; i += CONCURRENCY) {
      const batch = productsToSync.slice(i, i + CONCURRENCY);
      await Promise.all(
        batch.map(async (product, batchIdx) => {
          const idx = i + batchIdx + 1;
          try {
            log(`[${idx}/${productsToSync.length}] Syncing: ${product.model || product.product_id}`);
            const fakeJob = {
              data: { product, domain, shop: domain, accessToken, forceProductSet },
            };
            await processSyncTask(fakeJob as any);
            log(`[${idx}/${productsToSync.length}] Done: ${product.model || product.product_id}`);
          } catch (e: any) {
            log(`[${idx}/${productsToSync.length}] Error ${product.model || product.product_id}: ${e.message}`);
          }
        }),
      );
    }

    log(`Sync completed successfully`);
    return logs;
  } catch (e: any) {
    logs.push(`Error: ${e.message}`);
    throw Object.assign(new Error(`Error syncing products: ${e.message}`), {
      logs,
    });
  }
};
