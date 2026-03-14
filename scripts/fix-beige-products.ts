/**
 * Re-sync all active products with color "Бежевий".
 * Previously Бежевий was mapped to "bilij" (white) — now correctly "bezhevij".
 * This re-sync will:
 *   1. Assign the correct color metaobject (bezhevij, not bilij)
 *   2. Fix the handle (was colliding with white variant)
 *   3. Fix bound-products links
 *
 * Run:
 *   npx dotenv-cli -e .env -- tsx scripts/fix-beige-products.ts
 *   npx dotenv-cli -e .env -- tsx scripts/fix-beige-products.ts --dry-run   (list only)
 */

import { PrismaClient } from "../prisma/generated/app_client/client";
import { PrismaClient as ExternalPrismaClient } from "../prisma/generated/external_client/client";
import { processSyncTask } from "../app/service/sync/products/sync-product.worker";

const prisma = new PrismaClient();
const externalDB = new ExternalPrismaClient();

const DRY_RUN = process.argv.includes("--dry-run");
const CONCURRENCY = 3;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getBeigeProductModels(): Promise<Array<{ product_id: number; model: string }>> {
  // Find option_ids for "Колір"
  const colorOptionDescs = await externalDB.bc_option_description.findMany({
    where: { language_id: 3, name: "Колір" },
  });
  const colorOptionIds = colorOptionDescs.map((d) => d.option_id);

  // Find option_value_ids for "Бежевий"
  const beigeValueDescs = await externalDB.bc_option_value_description.findMany({
    where: { language_id: 3, name: "Бежевий" },
  });
  const beigeValueIds = beigeValueDescs.map((d) => d.option_value_id);

  // Find product_ids that have Бежевий in color option
  const povs = await externalDB.bc_product_option_value.findMany({
    where: {
      option_id: { in: colorOptionIds },
      option_value_id: { in: beigeValueIds },
    },
    select: { product_id: true },
  });
  const productIds = [...new Set(povs.map((p) => p.product_id))];

  // Get active products
  const rows = await externalDB.$queryRawUnsafe<Array<{ product_id: number; model: string }>>(
    `SELECT product_id, model FROM bc_product WHERE product_id IN (${productIds.join(",")}) AND status = 1`,
  );

  return rows;
}

async function main() {
  const session = await prisma.session.findFirst({
    where: { shop: { not: undefined } },
    orderBy: { id: "desc" },
  });
  if (!session?.accessToken) throw new Error("No Shopify session found in DB");
  console.log(`Shop: ${session.shop}${DRY_RUN ? "  [DRY RUN]" : ""}`);

  const products = await getBeigeProductModels();
  console.log(`\nFound ${products.length} active products with color "Бежевий"\n`);

  if (DRY_RUN) {
    products.forEach((p) => console.log(`  product_id=${p.product_id}  model="${p.model}"`));
    return;
  }

  let success = 0;
  let errors = 0;

  // Process in batches of CONCURRENCY
  for (let i = 0; i < products.length; i += CONCURRENCY) {
    const batch = products.slice(i, i + CONCURRENCY);

    await Promise.all(
      batch.map(async (p) => {
        try {
          const fullProduct = await externalDB.$queryRawUnsafe<any[]>(
            `SELECT product_id, model, sku, upc, ean, jan, isbn, mpn, location, quantity,
             stock_status_id, image, manufacturer_id, shipping, price, points, tax_class_id,
             weight, weight_class_id, length, width, height, length_class_id, subtract,
             minimum, sort_order, status, viewed, noindex, af_values, af_tags,
             extra_special, import_batch, meta_robots, seo_canonical, new, rasprodaja
             FROM bc_product WHERE product_id = ${p.product_id}`,
          );

          if (!fullProduct[0]) {
            console.log(`  SKIP ${p.model}: not found`);
            errors++;
            return;
          }

          await processSyncTask({
            data: {
              product: fullProduct[0],
              domain: session.shop,
              shop: session.shop,
              accessToken: session.accessToken,
            },
          } as any);

          success++;
          console.log(`  [${i + batch.indexOf(p) + 1}/${products.length}] ✓ ${p.model} (id=${p.product_id})`);
        } catch (err: any) {
          errors++;
          console.error(`  [${i + batch.indexOf(p) + 1}/${products.length}] ✗ ${p.model}: ${err.message}`);
        }
      }),
    );

    // Small pause between batches to avoid rate limits
    if (i + CONCURRENCY < products.length) {
      await sleep(500);
    }
  }

  console.log(`\n${"═".repeat(50)}`);
  console.log(`Done. Success: ${success}  Errors: ${errors}`);
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    await externalDB.$disconnect();
  });
