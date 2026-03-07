/**
 * Check product quantity in external DB for a given model (SKU)
 * Run: npx dotenv-cli -e .env tsx scripts/check-product-quantity.ts
 */

import { PrismaClient as ExternalPrismaClient } from "prisma/generated/external_client/client";

const externalDB = new ExternalPrismaClient();

const MODEL = "7W000477";

async function main() {
  const product = await externalDB.bc_product.findFirst({
    where: { model: MODEL },
    select: {
      product_id: true,
      model: true,
      quantity: true,
      status: true,
      price: true,
      date_modified: true,
    },
  });

  if (!product) {
    console.log(`Product with model "${MODEL}" not found`);
    return;
  }

  console.log("\n=== PRODUCT (bc_product) ===");
  console.log(`  product_id    : ${product.product_id}`);
  console.log(`  model         : ${product.model}`);
  console.log(`  quantity      : ${product.quantity}`);
  console.log(`  date_modified : ${product.date_modified}`);

  const productOptions = await externalDB.bc_product_option.findMany({
    where: { product_id: product.product_id },
  });

  const productOptionValues = await externalDB.bc_product_option_value.findMany({
    where: {
      product_id: product.product_id,
      product_option_id: { in: productOptions.map((o) => o.product_option_id) },
    },
  });

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

  console.log(`\n=== VARIANTS (bc_product_option_value) ===`);
  for (const pov of productOptionValues) {
    const optName = optionNameMap.get(pov.option_id) ?? `option_id=${pov.option_id}`;
    const valName = optionValueNameMap.get(pov.option_value_id) ?? `value_id=${pov.option_value_id}`;
    console.log(`  [${optName}] ${valName.padEnd(20)} quantity=${pov.quantity}`);
  }
}

main()
  .catch(console.error)
  .finally(() => externalDB.$disconnect());
