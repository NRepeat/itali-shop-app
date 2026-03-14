/**
 * Debug & fix inventory sync discrepancies between external DB and Shopify.
 *
 * Modes:
 *   --sku <model>   — debug single product (e.g. --sku 531-camel)
 *   --scan          — scan ALL active products for variant count / qty mismatches
 *   --fix           — force-sync all mismatched products (use with --sku or --scan)
 *   --limit <n>     — limit scan to first N products (default: no limit)
 *
 * Examples:
 *   dotenv -e .env tsx scripts/debug-inventory-sync.ts --sku 531-camel
 *   dotenv -e .env tsx scripts/debug-inventory-sync.ts --scan
 *   dotenv -e .env tsx scripts/debug-inventory-sync.ts --scan --fix
 *   dotenv -e .env tsx scripts/debug-inventory-sync.ts --sku 531-camel --fix
 */

import { PrismaClient } from "../prisma/generated/app_client/client";
import { PrismaClient as ExternalPrismaClient } from "../prisma/generated/external_client/client";
import { client } from "../app/shared/lib/shopify/client/client";
import { processSyncTask } from "../app/service/sync/products/sync-product.worker";

const prisma = new PrismaClient();
const externalDB = new ExternalPrismaClient();

// ─── CLI args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const getArg = (flag: string) => {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : null;
};
const hasFlag = (flag: string) => args.includes(flag);

const SKU = getArg("--sku");
const SCAN = hasFlag("--scan");
const FIX = hasFlag("--fix");
const LIMIT = getArg("--limit") ? parseInt(getArg("--limit")!, 10) : 0;

if (!SKU && !SCAN) {
  console.error("Usage: --sku <model>  or  --scan  [--fix] [--limit N]");
  process.exit(1);
}

// ─── Shopify queries ───────────────────────────────────────────────────────────

const GET_PRODUCT_BY_SKU_QUERY = `
  query DebugGetProductBySku($query: String!) {
    products(first: 5, query: $query) {
      edges {
        node {
          id
          title
          handle
          variants(first: 100) {
            nodes {
              id
              sku
              title
              inventoryItem { id }
              inventoryQuantity
              selectedOptions { name value }
            }
          }
        }
      }
    }
  }
`;

const GET_PRODUCT_VARIANTS_QUERY = `
  query DebugGetVariants($id: ID!) {
    product(id: $id) {
      id title handle
      variants(first: 100) {
        nodes {
          id
          sku
          title
          inventoryItem { id }
          inventoryQuantity
          selectedOptions { name value }
        }
      }
    }
  }
`;

interface ShopifyVariant {
  id: string;
  sku: string;
  title: string;
  inventoryItem: { id: string };
  inventoryQuantity: number;
  selectedOptions: Array<{ name: string; value: string }>;
}

interface ShopifyProduct {
  id: string;
  title: string;
  handle: string;
  variants: { nodes: ShopifyVariant[] };
}

async function fetchShopifyProductBySku(
  sku: string,
  accessToken: string,
  shopDomain: string,
): Promise<ShopifyProduct | null> {
  const res: any = await client.request({
    query: GET_PRODUCT_BY_SKU_QUERY,
    variables: { query: `sku:${sku}` },
    accessToken,
    shopDomain,
  });
  const edges = res?.products?.edges ?? [];
  if (edges.length === 0) return null;
  // Return first product whose variant actually has this SKU
  for (const edge of edges) {
    const node = edge.node as ShopifyProduct;
    if (node.variants.nodes.some((v) => v.sku === sku)) return node;
  }
  return edges[0].node as ShopifyProduct;
}

async function fetchShopifyProductById(
  id: string,
  accessToken: string,
  shopDomain: string,
): Promise<ShopifyProduct | null> {
  const res: any = await client.request({
    query: GET_PRODUCT_VARIANTS_QUERY,
    variables: { id },
    accessToken,
    shopDomain,
  });
  return res?.product ?? null;
}

const LOCATION_ID = "gid://shopify/Location/78249492642";

const INVENTORY_SET_QUANTITIES_MUTATION = `
  mutation inventorySetQuantities($input: InventorySetQuantitiesInput!) {
    inventorySetQuantities(input: $input) {
      inventoryAdjustmentGroup { reason changes { name delta } }
      userErrors { field message }
    }
  }
`;

async function fastFixInventory(
  shopifyVariants: ShopifyVariant[],
  validCombos: ExtVariant[][],
  noOptions: boolean,
  baseQty: number,
  accessToken: string,
  shopDomain: string,
): Promise<void> {
  const quantities = shopifyVariants.map((sv, i) => ({
    inventoryItemId: sv.inventoryItem.id,
    locationId: LOCATION_ID,
    quantity: noOptions ? baseQty : (validCombos[i] ? Math.min(...validCombos[i].map((v) => v.quantity)) : 0),
  }));
  const res: any = await client.request({
    query: INVENTORY_SET_QUANTITIES_MUTATION,
    variables: { input: { name: "available", reason: "correction", ignoreCompareQuantity: true, quantities } },
    accessToken,
    shopDomain,
  });
  const errs = res?.inventorySetQuantities?.userErrors ?? [];
  if (errs.length > 0) throw new Error(JSON.stringify(errs));
}

// ─── External DB helpers ───────────────────────────────────────────────────────

const colorMapping: Record<string, string> = {
  Блакитний: "blakitnij", Рожевий: "rozhevij", Фіолетовий: "fioletovij",
  Коричневий: "korichnevij", Гірчичний: "girchichnij", Бордовий: "bordovij",
  Червоний: "chervonij", Срібло: "sriblo", Зелений: "zelenij",
  Жовтий: "zhovtij", Хакі: "haki", Помаранчевий: "pomaranchevij",
  Рудий: "rudij", Синій: "sinij", Бежевий: "bilij", Чорний: "chornij",
  Білий: "bilij", Золото: "zoloto", Бронзовий: "bronzovij", Сірий: "sirij",
  Мультиколор: "multikolor", "М'ятний": "m-jatnij", Пітон: "piton",
};

interface ExtVariant {
  optionName: string;
  valueName: string;
  handle: string;
  quantity: number;
  reserved: boolean;
  metaobjectId: string | null; // null = not found in local DB
}

async function fetchExtVariants(productId: number): Promise<ExtVariant[]> {
  const productOptions = await externalDB.bc_product_option.findMany({
    where: { product_id: productId },
  });

  const productOptionValues = await externalDB.bc_product_option_value.findMany({
    where: {
      product_id: productId,
      product_option_id: { in: productOptions.map((o) => o.product_option_id) },
    },
  });

  if (productOptionValues.length === 0) return [];

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

  const results: ExtVariant[] = [];

  for (const pov of productOptionValues) {
    const optionName = optionNameMap.get(pov.option_id) ?? `option_id=${pov.option_id}`;
    const valueName = optionValueNameMap.get(pov.option_value_id) ?? `value_id=${pov.option_value_id}`;

    let handle: string;
    if (optionName === "Колір") {
      handle = colorMapping[valueName] ?? valueName.toLowerCase();
    } else {
      handle = valueName.toLowerCase().replace(",", "-");
    }

    // Determine metaobject type from local metafield definitions
    // We use MetaobjectDefinition to get the type for this option
    const metaobject = await prisma.metaobject.findFirst({
      where: { handle },
    });

    results.push({
      optionName,
      valueName,
      handle,
      quantity: pov.quantity,
      reserved: pov.reserved ?? false,
      metaobjectId: metaobject?.metaobjectId ?? null,
    });
  }

  return results;
}

// ─── Cartesian product helper ─────────────────────────────────────────────────

function cartesian<T>(...args: T[][]): T[][] {
  const r: T[][] = [];
  const helper = (arr: T[], i: number) => {
    for (const item of args[i]) {
      const a = [...arr, item];
      if (i === args.length - 1) r.push(a);
      else helper(a, i + 1);
    }
  };
  if (args.length > 0) helper([], 0);
  return r;
}

// ─── Debug single product ─────────────────────────────────────────────────────

async function debugProduct(
  sku: string,
  accessToken: string,
  shopDomain: string,
) {
  console.log(`\n${"═".repeat(70)}`);
  console.log(`  PRODUCT: ${sku}`);
  console.log("═".repeat(70));

  // External DB
  const extProduct = await externalDB.bc_product.findFirst({
    where: { model: sku },
    select: { product_id: true, model: true, quantity: true, status: true, price: true },
  });

  if (!extProduct) {
    console.log(`  [EXT] NOT FOUND in external DB`);
    return { sku, status: "not_in_ext" as const };
  }

  console.log(`\n[EXT] product_id=${extProduct.product_id}  status=${extProduct.status}  base_qty=${extProduct.quantity}  price=${extProduct.price}`);

  const extVariants = await fetchExtVariants(extProduct.product_id);

  // Group by option
  const byOption = new Map<string, ExtVariant[]>();
  for (const v of extVariants) {
    if (!byOption.has(v.optionName)) byOption.set(v.optionName, []);
    byOption.get(v.optionName)!.push(v);
  }

  console.log(`\n[EXT] Option values (${extVariants.length} total):`);
  for (const [optName, vals] of byOption) {
    for (const v of vals) {
      const metaStatus = v.metaobjectId ? `✓ metaobject=${v.metaobjectId.split("/").pop()}` : "✗ NO METAOBJECT";
      console.log(`  [${optName}] "${v.valueName}"  handle="${v.handle}"  qty=${v.quantity}  ${metaStatus}`);
    }
  }

  // Simulate variant building
  const optionGroups = Array.from(byOption.values());
  let expectedVariants = 0;
  let skippedCombos = 0;

  if (optionGroups.length === 0) {
    expectedVariants = 1; // Default Title
  } else {
    const combos = cartesian(...optionGroups);
    console.log(`\n[SIM] Cartesian combos: ${combos.length}`);
    for (const combo of combos) {
      const missingMeta = combo.find((v) => !v.metaobjectId);
      if (missingMeta) {
        skippedCombos++;
        console.log(`  SKIP: "${missingMeta.valueName}" (${missingMeta.optionName}) — metaobject missing`);
      } else {
        const qty = Math.min(...combo.map((v) => v.quantity));
        expectedVariants++;
        console.log(`  OK:   ${combo.map((v) => `${v.optionName}="${v.valueName}"`).join(", ")}  qty=${qty}`);
      }
    }
  }
  console.log(`\n[SIM] Expected Shopify variants: ${expectedVariants}  (skipped: ${skippedCombos})`);

  // Shopify
  let shopifyProduct: ShopifyProduct | null = null;

  // Try productMap first
  const productMap = await prisma.productMap.findUnique({
    where: { localProductId: extProduct.product_id },
  });

  if (productMap) {
    shopifyProduct = await fetchShopifyProductById(productMap.shopifyProductId, accessToken, shopDomain);
    if (shopifyProduct) {
      console.log(`\n[SHOPIFY] Found via productMap → ${productMap.shopifyProductId}`);
    } else {
      console.log(`\n[SHOPIFY] productMap entry exists but product DELETED in Shopify (${productMap.shopifyProductId})`);
    }
  }

  if (!shopifyProduct) {
    shopifyProduct = await fetchShopifyProductBySku(sku, accessToken, shopDomain);
    if (shopifyProduct) {
      console.log(`\n[SHOPIFY] Found via SKU search → ${shopifyProduct.id}`);
    }
  }

  if (!shopifyProduct) {
    console.log(`\n[SHOPIFY] NOT FOUND`);
    return { sku, productId: extProduct.product_id, status: "not_in_shopify" as const, expectedVariants, skippedCombos };
  }

  const shopifyVariants = shopifyProduct.variants.nodes;
  console.log(`[SHOPIFY] "${shopifyProduct.title}" (${shopifyProduct.handle})`);
  console.log(`[SHOPIFY] Variants: ${shopifyVariants.length}`);

  let totalShopifyQty = 0;

  for (const sv of shopifyVariants) {
    const opts = sv.selectedOptions.map((o) => `${o.name}="${o.value}"`).join(", ");
    console.log(`  ${sv.inventoryQuantity >= 0 ? " " : ""}qty=${sv.inventoryQuantity}  ${opts}`);
    totalShopifyQty += sv.inventoryQuantity;
  }

  // Compute expected qty using same min-combo logic as actual sync
  let totalExtQty = 0;
  if (optionGroups.length === 0) {
    totalExtQty = extProduct.quantity;
  } else {
    for (const combo of cartesian(...optionGroups)) {
      if (!combo.some((v) => !v.metaobjectId)) {
        totalExtQty += Math.min(...combo.map((v) => v.quantity));
      }
    }
  }

  const variantCountMatch = shopifyVariants.length === expectedVariants;
  const hasMismatch = !variantCountMatch || totalShopifyQty !== totalExtQty;

  console.log(`\n[COMPARE]`);
  console.log(`  Variant count : ext_expected=${expectedVariants}  shopify=${shopifyVariants.length}  ${variantCountMatch ? "✓ OK" : "✗ MISMATCH"}`);
  console.log(`  Total qty sum : ext=${totalExtQty}  shopify=${totalShopifyQty}  ${totalShopifyQty === totalExtQty ? "✓ OK" : "✗ MISMATCH"}`);
  if (skippedCombos > 0) {
    console.log(`  ⚠ ${skippedCombos} combo(s) would be SKIPPED due to missing metaobjects`);
  }

  return {
    sku,
    productId: extProduct.product_id,
    status: hasMismatch ? "mismatch" as const : "ok" as const,
    expectedVariants,
    shopifyVariants: shopifyVariants.length,
    skippedCombos,
    shopifyProductId: shopifyProduct.id,
    totalExtQty,
    totalShopifyQty,
  };
}

// ─── Bulk scan ─────────────────────────────────────────────────────────────────

async function scan(accessToken: string, shopDomain: string) {
  console.log("\nFetching active products from external DB...");

  const externalProducts = await externalDB.bc_product.findMany({
    where: { status: true, quantity: { gt: 0 } },
    select: { product_id: true, model: true, quantity: true },
    orderBy: { product_id: "asc" },
    ...(LIMIT > 0 ? { take: LIMIT } : {}),
  });

  console.log(`Found ${externalProducts.length} active products. Scanning...`);
  console.log("(This may take a while due to Shopify API rate limits)\n");

  const mismatched: Array<{ sku: string; productId: number; shopifyProductId?: string; expectedVariants: number; shopifyVariants: number; skippedCombos: number; totalExtQty: number; totalShopifyQty: number }> = [];
  const notInShopify: string[] = [];
  const needsFullSync: string[] = [];
  let ok = 0;
  let fastFixed = 0;
  let fastErrors = 0;

  for (let i = 0; i < externalProducts.length; i++) {
    const p = externalProducts[i];
    const sku = p.model?.trim();
    if (!sku) continue;

    if ((i + 1) % 50 === 0) {
      console.log(`  Progress: ${i + 1}/${externalProducts.length}  mismatches=${mismatched.length}  missing=${notInShopify.length}`);
    }

    // Lean check: fetch only variant count and qty from Shopify
    let shopifyProductId: string | undefined;

    const productMap = await prisma.productMap.findUnique({
      where: { localProductId: p.product_id },
    });

    if (productMap) {
      shopifyProductId = productMap.shopifyProductId;
    }

    const extVariants = await fetchExtVariants(p.product_id);

    const byOption = new Map<string, ExtVariant[]>();
    for (const v of extVariants) {
      if (!byOption.has(v.optionName)) byOption.set(v.optionName, []);
      byOption.get(v.optionName)!.push(v);
    }

    const optionGroups = Array.from(byOption.values());
    let expectedVariants = 0;
    let skippedCombos = 0;
    const validCombos: ExtVariant[][] = [];

    let totalExtQty = 0;
    if (optionGroups.length === 0) {
      expectedVariants = 1;
      totalExtQty = p.quantity;
    } else {
      const combos = cartesian(...optionGroups);
      for (const combo of combos) {
        if (combo.some((v) => !v.metaobjectId)) skippedCombos++;
        else {
          expectedVariants++;
          totalExtQty += Math.min(...combo.map((v) => v.quantity));
          validCombos.push(combo);
        }
      }
    }

    // Fetch Shopify variants
    let shopifyVariantCount = 0;
    let totalShopifyQty = 0;
    let resolvedShopifyId: string | undefined;
    let shopifyProduct: ShopifyProduct | null = null;

    try {
      if (shopifyProductId) {
        shopifyProduct = await fetchShopifyProductById(shopifyProductId, accessToken, shopDomain);
      }
      if (!shopifyProduct) {
        shopifyProduct = await fetchShopifyProductBySku(sku, accessToken, shopDomain);
      }

      if (!shopifyProduct) {
        notInShopify.push(sku);
        continue;
      }

      resolvedShopifyId = shopifyProduct.id;
      shopifyVariantCount = shopifyProduct.variants.nodes.length;
      totalShopifyQty = shopifyProduct.variants.nodes.reduce((s, v) => s + v.inventoryQuantity, 0);
    } catch (err: any) {
      console.error(`  Error fetching Shopify data for ${sku}: ${err.message}`);
      continue;
    }

    if (shopifyVariantCount !== expectedVariants || totalShopifyQty !== totalExtQty) {
      mismatched.push({
        sku,
        productId: p.product_id,
        shopifyProductId: resolvedShopifyId,
        expectedVariants,
        shopifyVariants: shopifyVariantCount,
        skippedCombos,
        totalExtQty,
        totalShopifyQty,
      });

      if (FIX) {
        if (shopifyVariantCount === expectedVariants) {
          // Fast path: only qty mismatch — update inventory in-place, no full sync needed
          try {
            await fastFixInventory(
              shopifyProduct!.variants.nodes,
              validCombos,
              optionGroups.length === 0,
              p.quantity,
              accessToken,
              shopDomain,
            );
            console.log(`  ✓ qty fixed: ${sku}  (${totalShopifyQty} → ${totalExtQty})`);
            fastFixed++;
          } catch (err: any) {
            console.error(`  ✗ qty fix failed: ${sku}: ${err.message}`);
            fastErrors++;
            needsFullSync.push(sku);
          }
        } else {
          // Variant count mismatch — needs full productSet
          needsFullSync.push(sku);
        }
      }
    } else {
      ok++;
    }
  }

  console.log(`\n${"═".repeat(70)}`);
  console.log(`  SCAN RESULTS`);
  console.log("═".repeat(70));
  console.log(`  OK              : ${ok}`);
  console.log(`  MISMATCH        : ${mismatched.length}`);
  console.log(`  NOT_IN_SHOPIFY  : ${notInShopify.length}`);
  if (FIX) {
    console.log(`  Fast fixed (qty): ${fastFixed}`);
    console.log(`  Fast errors     : ${fastErrors}`);
    console.log(`  Needs full sync : ${needsFullSync.length}`);
  }

  if (mismatched.length > 0) {
    console.log(`\nMISMATCHED PRODUCTS:`);
    console.log(`  ${"SKU".padEnd(25)} ${"ext_v".padEnd(6)} ${"shp_v".padEnd(6)} ${"skip".padEnd(5)} ${"ext_qty".padEnd(8)} ${"shp_qty".padEnd(8)}`);
    for (const m of mismatched) {
      const variantMark = m.shopifyVariants !== m.expectedVariants ? "!" : " ";
      const qtyMark = m.totalShopifyQty !== m.totalExtQty ? "!" : " ";
      console.log(
        `${variantMark} ${m.sku.padEnd(25)} ${String(m.expectedVariants).padEnd(6)} ${String(m.shopifyVariants).padEnd(6)} ${String(m.skippedCombos).padEnd(5)} ${String(m.totalExtQty).padEnd(8)}${qtyMark}${String(m.totalShopifyQty).padEnd(8)}`
      );
    }
  }

  if (notInShopify.length > 0 && notInShopify.length <= 20) {
    console.log(`\nNOT IN SHOPIFY (first 20):`);
    notInShopify.slice(0, 20).forEach((s) => console.log(`  ${s}`));
  }

  // Return only products that need a full sync (variant count mismatch)
  return FIX ? needsFullSync : mismatched.map((m) => m.sku);
}

// ─── Force sync ────────────────────────────────────────────────────────────────

async function forceSync(skus: string[], session: { shop: string; accessToken: string }) {
  console.log(`\n${"═".repeat(70)}`);
  console.log(`  FORCE SYNC (${skus.length} products)`);
  console.log("═".repeat(70));

  for (const sku of skus) {
    console.log(`\n→ Syncing ${sku}...`);

    const product = await externalDB.bc_product.findFirst({
      where: { model: sku },
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
      console.log(`  SKIP: product not found in external DB`);
      continue;
    }

    try {
      await processSyncTask({
        data: {
          product,
          domain: session.shop,
          shop: session.shop,
          accessToken: session.accessToken,
        },
      } as any);
      console.log(`  ✓ Done`);
    } catch (err: any) {
      console.error(`  ✗ Error: ${err.message}`);
    }
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const session = await prisma.session.findFirst({
    where: { shop: { not: undefined } },
    orderBy: { id: "desc" },
  });
  if (!session?.accessToken) throw new Error("No Shopify session found in DB");
  console.log(`Shop: ${session.shop}`);

  let skusToFix: string[] = [];

  if (SKU) {
    const result = await debugProduct(SKU, session.accessToken, session.shop);
    if (FIX && result.status === "mismatch") {
      skusToFix = [SKU];
    } else if (FIX && result.status === "not_in_shopify") {
      skusToFix = [SKU];
    }
  } else if (SCAN) {
    skusToFix = await scan(session.accessToken, session.shop);
  }

  if (FIX && skusToFix.length > 0) {
    await forceSync(skusToFix, session);
  } else if (FIX && skusToFix.length === 0) {
    console.log("\n✓ No mismatches found, nothing to fix.");
  }
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    await externalDB.$disconnect();
  });
