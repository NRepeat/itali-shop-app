/**
 * Check which option value sizes/dimensions are missing metaobjects in local DB.
 * Run: npx dotenv-cli -e .env tsx scripts/check-missing-metaobjects.ts
 */
import { PrismaClient as ExternalPrismaClient } from "../prisma/generated/external_client/client";
import { PrismaClient } from "../prisma/generated/app_client/client";

const externalDB = new ExternalPrismaClient();
const prisma = new PrismaClient();

async function checkOption(optionName: string) {
  const optionDescs = await externalDB.bc_option_description.findMany({
    where: { language_id: 3, name: optionName },
  });
  const optionIds = optionDescs.map((d) => d.option_id);

  const productOptionValues = await externalDB.bc_product_option_value.findMany({
    where: { option_id: { in: optionIds } },
    select: { option_value_id: true },
  });
  const distinctValueIds = [...new Set(productOptionValues.map((v) => v.option_value_id))];

  const valueDescriptions = await externalDB.bc_option_value_description.findMany({
    where: { language_id: 3, option_value_id: { in: distinctValueIds } },
  });

  const distinct = [...new Map(valueDescriptions.map((v) => [v.name, v])).values()].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true }),
  );

  const missing: string[] = [];
  const found: string[] = [];

  for (const v of distinct) {
    const handle = v.name.toLowerCase().replace(",", "-");
    const mo = await prisma.metaobject.findFirst({ where: { handle } });
    if (!mo) missing.push(`${v.name} (handle: ${handle})`);
    else found.push(v.name);
  }

  console.log(`\n=== Option: "${optionName}" ===`);
  console.log(`  Total distinct values : ${distinct.length}`);
  console.log(`  With metaobject  ✓   : ${found.length}`);
  console.log(`  Missing metaobject ✗ : ${missing.length}`);
  if (missing.length > 0) {
    console.log(`  Missing:`);
    missing.forEach((m) => console.log(`    - ${m}`));
  }

  return { optionName, total: distinct.length, found: found.length, missing };
}

async function main() {
  // Check options that are commonly linked via metaobjects
  const optionsToCheck = ["Розмір", "Колір", "Матеріал"];

  for (const opt of optionsToCheck) {
    await checkOption(opt);
  }
}

main()
  .catch(console.error)
  .finally(async () => {
    await externalDB.$disconnect();
    await prisma.$disconnect();
  });
