/**
 * Force sync a single product by model (SKU) — bypasses the quantity > 0 filter
 * Run: dotenv -e .env tsx scripts/force-sync-product.ts
 */

import { PrismaClient } from "prisma/generated/app_client/client";
import { PrismaClient as ExternalPrismaClient } from "prisma/generated/external_client/client";
import { processSyncTask } from "../app/service/sync/products/sync-product.worker";

const prisma = new PrismaClient();
const externalDB = new ExternalPrismaClient();

const MODEL = "7W000477";

async function main() {
  const session = await prisma.session.findFirst({
    where: { shop: { not: undefined } },
    orderBy: { id: "desc" },
  });

  if (!session || !session.accessToken) {
    throw new Error("No Shopify session found in DB");
  }

  console.log(`Using session for shop: ${session.shop}`);

  const product = await externalDB.bc_product.findFirst({
    where: { model: MODEL },
    select: {
      product_id: true, model: true, sku: true, upc: true, ean: true,
      jan: true, isbn: true, mpn: true, location: true, quantity: true,
      stock_status_id: true, image: true, manufacturer_id: true, shipping: true,
      price: true, points: true, tax_class_id: true, weight: true,
      weight_class_id: true, length: true, width: true, height: true,
      length_class_id: true, subtract: true, minimum: true, sort_order: true,
      status: true, viewed: true, noindex: true, af_values: true, af_tags: true,
      extra_special: true, import_batch: true, meta_robots: true,
      seo_canonical: true, new: true, rasprodaja: true,
    },
  });

  if (!product) {
    throw new Error(`Product with model "${MODEL}" not found in external DB`);
  }

  console.log(`Found product: ${product.product_id} (${product.model}) — quantity=${product.quantity}`);
  console.log("Starting force sync...\n");

  const fakeJob = {
    data: {
      product,
      domain: session.shop,
      shop: session.shop,
      accessToken: session.accessToken,
    },
  };

  await processSyncTask(fakeJob as any);

  console.log("\nForce sync completed.");
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    await externalDB.$disconnect();
  });
