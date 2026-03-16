/**
 * Script: generate-redirects.ts
 * Run: dotenv -e .env tsx app/scripts/generate-redirects.ts
 *
 * Generates a Cloudflare Bulk Redirects CSV from the external (OpenCart) database.
 * Maps italishoes.com.ua → miomio.com.ua for both UK and RU locales.
 *
 * Output format (same as Cloudflare Redirects CSV):
 *   source_url,destination_url,301,TRUE,FALSE,FALSE,FALSE
 */

import { PrismaClient as ExternalPrismaClient } from "prisma/generated/external_client/client";
import { writeFileSync } from "fs";
import path from "path";

const externalDB = new ExternalPrismaClient();

// ─── Config ──────────────────────────────────────────────────────────────────
const OLD_DOMAIN = "https://italishoes.com.ua";
const NEW_DOMAIN = "https://www.miomio.com.ua";
const OUTPUT_FILE = path.resolve("redirects-generated.csv");

const LANGUAGE_ID_RU = 1;
const LANGUAGE_ID_UK = 3;
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Same sanitizeHandle logic as app/shared/handle.ts.
 * Removes Unicode apostrophes, normalizes NFD, strips diacritics,
 * replaces non-url chars with hyphens, collapses multiple hyphens.
 */
function sanitizeHandle(handle: string): string {
  return handle
    .replace(/[\u02BC\u2019\u2018\u0060\u00B4\u02B9\u02BB\u02BD\u02BE\u02BF]/g, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Same stripGenderFromHandle logic as app/service/sync/collection/syncCollections.ts
 */
const GENDER_SLUGS_UK = ["zhinochi", "zhinocha", "zhinoche", "zhinochyj", "cholovichi", "cholovicha", "choloviche", "cholovichyj", "dityachi", "uniseks"];
const GENDER_SLUGS_RU = ["zhenskie", "zhenskaya", "zhenskoe", "muzhskie", "muzhskaya", "muzhskoe", "detskie"];

function stripGenderFromHandle(handle: string): string {
  const allGenderSlugs = [...GENDER_SLUGS_UK, ...GENDER_SLUGS_RU];
  return handle
    .split("-")
    .filter((part) => !allGenderSlugs.includes(part))
    .join("-");
}

/**
 * Detects gender segment for new site URL from the raw seo_keyword.
 * Returns 'woman', 'man', or null (no gender = top-level category like "shoes").
 */
function detectGender(ukHandle: string, ruHandle?: string): "woman" | "man" | null {
  const ukParts = ukHandle.split("-");
  if (
    ukParts.some((p) => ["zhinochi", "zhinocha", "zhinoche", "zhinochyj"].includes(p))
  ) return "woman";
  if (
    ukParts.some((p) => ["cholovichi", "cholovicha", "choloviche", "cholovichyj"].includes(p))
  ) return "man";

  // Fallback: check RU handle
  if (ruHandle) {
    const ruParts = ruHandle.split("-");
    if (ruParts.some((p) => ["zhenskie", "zhenskaya", "zhenskoe"].includes(p))) return "woman";
    if (ruParts.some((p) => ["muzhskie", "muzhskaya", "muzhskoe"].includes(p))) return "man";
    // Additional RU patterns
    if (ruHandle.includes("zhensk")) return "woman";
    if (ruHandle.includes("muzh")) return "man";
    if (ruHandle.includes("zhens")) return "woman";
  }

  return null;
}

function csvRow(source: string, destination: string): string {
  return `${source},${destination},301,TRUE,FALSE,FALSE,FALSE`;
}

async function main() {
  console.log("Fetching categories from external DB...");

  const [categories, descriptions] = await Promise.all([
    externalDB.bc_category.findMany({ where: { status: true } }),
    externalDB.bc_category_description.findMany({
      where: { language_id: { in: [LANGUAGE_ID_UK, LANGUAGE_ID_RU] } },
    }),
  ]);

  console.log(`Found ${categories.length} active categories, ${descriptions.length} descriptions`);

  // Build maps: category_id → { uk, ru }
  const descMap = new Map<number, { uk?: typeof descriptions[0]; ru?: typeof descriptions[0] }>();
  for (const desc of descriptions) {
    if (!descMap.has(desc.category_id)) descMap.set(desc.category_id, {});
    const entry = descMap.get(desc.category_id)!;
    if (desc.language_id === LANGUAGE_ID_UK) entry.uk = desc;
    if (desc.language_id === LANGUAGE_ID_RU) entry.ru = desc;
  }

  // Build parent_id → category map for nested URLs
  const categoryById = new Map(categories.map((c) => [c.category_id, c]));

  const rows: string[] = [];
  const seen = new Set<string>();

  const addRow = (source: string, dest: string) => {
    if (!seen.has(source)) {
      seen.add(source);
      rows.push(csvRow(source, dest));
    }
  };

  for (const category of categories) {
    const descs = descMap.get(category.category_id);
    if (!descs) continue;

    const { uk, ru } = descs;
    if (!uk?.seo_keyword && !ru?.seo_keyword) continue;

    const ukRaw = uk?.seo_keyword?.trim() ?? "";
    const ruRaw = ru?.seo_keyword?.trim() ?? "";

    // Detect gender
    const gender = detectGender(ukRaw, ruRaw);

    // Build parent prefix for nested old URLs
    let parentUkSlug = "";
    let parentRuSlug = "";
    if (category.parent_id > 0) {
      const parentDescs = descMap.get(category.parent_id);
      parentUkSlug = parentDescs?.uk?.seo_keyword?.trim() ?? "";
      parentRuSlug = parentDescs?.ru?.seo_keyword?.trim() ?? "";
    }

    // ── UK redirects ──
    if (ukRaw) {
      const newUkHandle = sanitizeHandle(stripGenderFromHandle(ukRaw));
      const newUkPath = gender
        ? `/${LANGUAGE_ID_UK === 3 ? "uk" : "uk"}/${gender}/${newUkHandle}`
        : `/uk/${newUkHandle}`;

      // /seo_keyword → /uk/{gender}/{handle}
      addRow(`${OLD_DOMAIN}/${ukRaw}`, `${NEW_DOMAIN}${newUkPath}`);

      // /parent_seo_keyword/seo_keyword → /uk/{gender}/{handle}
      if (parentUkSlug) {
        addRow(`${OLD_DOMAIN}/${parentUkSlug}/${ukRaw}`, `${NEW_DOMAIN}${newUkPath}`);
      }
    }

    // ── RU redirects ──
    if (ruRaw) {
      const newRuHandle = sanitizeHandle(stripGenderFromHandle(ruRaw));
      const newRuPath = gender
        ? `/ru/${gender}/${newRuHandle}`
        : `/ru/${newRuHandle}`;

      addRow(`${OLD_DOMAIN}/${ruRaw}`, `${NEW_DOMAIN}${newRuPath}`);

      if (parentRuSlug) {
        addRow(`${OLD_DOMAIN}/${parentRuSlug}/${ruRaw}`, `${NEW_DOMAIN}${newRuPath}`);
      }
    }
  }

  // Sort: UK rows first, then RU
  rows.sort((a, b) => {
    const aIsUk = a.includes("/uk/");
    const bIsUk = b.includes("/uk/");
    if (aIsUk && !bIsUk) return -1;
    if (!aIsUk && bIsUk) return 1;
    return a.localeCompare(b);
  });

  writeFileSync(OUTPUT_FILE, rows.join("\n") + "\n", "utf-8");

  console.log(`\n✓ Generated ${rows.length} redirect rules`);
  console.log(`  Output: ${OUTPUT_FILE}`);
  console.log(`\nBreakdown:`);
  console.log(`  UK (/uk/*): ${rows.filter((r) => r.includes("/uk/")).length}`);
  console.log(`  RU (/ru/*): ${rows.filter((r) => r.includes("/ru/")).length}`);
  console.log(`  No gender:  ${rows.filter((r) => !r.includes("/uk/") && !r.includes("/ru/")).length}`);

  await externalDB.$disconnect();
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
