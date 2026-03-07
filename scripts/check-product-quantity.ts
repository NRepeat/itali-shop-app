/**
 * Check product quantity in external DB for a given model (SKU)
 * Run: dotenv -e .env tsx scripts/check-product-quantity.ts
 */

import { PrismaClient as ExternalPrismaClient } from "prisma/generated/external_client/client";

const externalDB = new ExternalPrismaClient();

const MODEL = "7w000477";

async function main() {
  // 1. Product-level
  const product = await externalDB.bc_product.findFirst({
    where: { model: MODEL },
    select: {
      product_id: true,
      model: true,
      quantity: true,
      status: true,
      price: true,
    },
  });

  if (!product) {
    console.log(`Product with model "${MODEL}" not found in external DB`);
    return;
  }

  console.log("\n=== PRODUCT (bc_product) ===");
  console.log(`  product_id : ${product.product_id}`);
  console.log(`  model      : ${product.model}`);
  console.log(`  status     : ${product.status}`);
  console.log(`  price      : ${product.price}`);
  console.log(`  quantity   : ${product.quantity}  <-- product-level stock`);

  // 2. Option values (variants)
  const productOptions = await externalDB.bc_product_option.findMany({
    where: { product_id: product.product_id },
  });

  const productOptionValues = await externalDB.bc_product_option_value.findMany({
    where: {
      product_id: product.product_id,
      product_option_id: { in: productOptions.map((o) => o.product_option_id) },
    },
  });

  console.log(`\n=== VARIANTS (bc_product_option_value) — ${productOptionValues.length} rows ===`);

  if (productOptionValues.length === 0) {
    console.log("  No option values found — product has a single default variant");
    console.log(`  Single variant quantity = product.quantity = ${product.quantity}`);
    return;
  }

  // Get option names for readability
  const optionDescriptions = await externalDB.bc_option_description.findMany({
    where: {
      language_id: 3,
      option_id: { in: productOptionValues.map((v) => v.option_id) },
    },
  });

  const optionValueDescriptions = await externalDB.bc_option_value_description.findMany({
    where: {
      language_id: 3,
      option_value_id: { in: productOptionValues.map((v) => v.option_value_id) },
    },
  });

  const optionNameMap = new Map(optionDescriptions.map((d) => [d.option_id, d.name]));
  const optionValueNameMap = new Map(optionValueDescriptions.map((d) => [d.option_value_id, d.name]));

  let allZero = true;
  for (const pov of productOptionValues) {
    const optName = optionNameMap.get(pov.option_id) ?? `option_id=${pov.option_id}`;
    const valName = optionValueNameMap.get(pov.option_value_id) ?? `value_id=${pov.option_value_id}`;
    const qty = pov.quantity;
    if (qty !== 0) allZero = false;
    const flag = qty === 0 ? "✓ ZERO" : "✗ NON-ZERO ← should be 0 after sale";
    console.log(`  [${optName}] ${valName.padEnd(20)} quantity=${qty}  ${flag}`);
  }

  console.log("\n=== VERDICT ===");
  if (allZero) {
    console.log("  All variant quantities are 0 in external DB.");
    console.log("  The sync bug (productSet ignoring inventory) is why Shopify still shows old stock.");
    console.log("  Run the sync for this product to push qty=0 to Shopify.");
  } else {
    console.log("  Some variants still have quantity > 0 in external DB.");
    console.log("  Either the sale was not yet reflected in the source system, or the wrong product was checked.");
  }
}

main()
  .catch(console.error)
  .finally(() => externalDB.$disconnect());
