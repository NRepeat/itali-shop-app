/**
 * Master fix script — runs all repair steps in order.
 *
 * Run:   npx dotenv-cli -e .env -- tsx scripts/fix-all.ts
 *
 * Flags (skip individual steps):
 *   --skip-sizes      skip step 1 (create missing size metaobjects)
 *   --skip-beige      skip step 2 (re-sync beige products)
 *   --skip-links      skip step 3 (fix bound/recommended metafields)
 *   --skip-inventory  skip step 4 (scan & fix inventory mismatches)
 */

import { execSync } from "child_process";
import * as path from "path";

const ROOT = path.resolve(import.meta.dirname, "..");

const SKIP_SIZES     = process.argv.includes("--skip-sizes");
const SKIP_BEIGE     = process.argv.includes("--skip-beige");
const SKIP_LINKS     = process.argv.includes("--skip-links");
const SKIP_INVENTORY = process.argv.includes("--skip-inventory");

function banner(step: number, title: string) {
  console.log(`\n${"═".repeat(70)}`);
  console.log(`  STEP ${step}: ${title}`);
  console.log("═".repeat(70) + "\n");
}

function run(script: string, args = "") {
  execSync(`npx dotenv-cli -e .env -- tsx ${script} ${args}`.trim(), {
    cwd: ROOT,
    stdio: "inherit",
  });
}

function main() {
  if (!SKIP_SIZES) {
    banner(1, "Create missing size metaobjects (52, 54, 56, 58, 60, L/XL, S/M, One Size, 25)");
    run("scripts/create-missing-size-metaobjects.ts");
  }

  if (!SKIP_BEIGE) {
    banner(2, "Re-sync beige products — color metaobject + handle + RU translation");
    run("scripts/fix-beige-products.ts");
  }

  if (!SKIP_LINKS) {
    banner(3, "Audit & fix bound-products + recommended_products metafields");
    run("scripts/audit-bound-products.ts", "--fix");
  }

  if (!SKIP_INVENTORY) {
    banner(4, "Scan all products for inventory/variant mismatches and force-sync");
    run("scripts/debug-inventory-sync.ts", "-- --scan --fix");
  }

  console.log(`\n${"═".repeat(70)}`);
  console.log("  ALL STEPS COMPLETE");
  console.log("═".repeat(70));
}

main();
