/**
 * Create missing size metaobjects in Shopify and register them in local DB.
 *
 * Run: npx dotenv-cli -e .env tsx scripts/create-missing-size-metaobjects.ts
 *
 * Add --dry-run to only print what would be created without making API calls.
 */

import { PrismaClient } from "../prisma/generated/app_client/client";
import { PrismaClient as ExternalPrismaClient } from "../prisma/generated/external_client/client";
import { client } from "../app/shared/lib/shopify/client/client";

const prisma = new PrismaClient();
const externalDB = new ExternalPrismaClient();

const DRY_RUN = process.argv.includes("--dry-run");
const ROZMIR_TYPE = "rozmir";

// Same sanitization used by buildProductVariants (after fix)
export function toMetaobjectHandle(name: string): string {
  return name
    .toLowerCase()
    .replace(/,/g, "-")
    .replace(/\//g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/[^a-z0-9\-_]/g, "");
}

const UPSERT_METAOBJECT_MUTATION = `
  mutation UpsertMetaobject($handle: MetaobjectHandleInput!, $metaobject: MetaobjectUpsertInput!) {
    metaobjectUpsert(handle: $handle, metaobject: $metaobject) {
      metaobject { handle id type }
      userErrors { field message code }
    }
  }
`;

async function upsertMetaobjectRaw(
  handle: string,
  type: string,
  label: string,
  accessToken: string,
  shopDomain: string,
): Promise<{ handle: string; id: string; type: string } | null> {
  const res: any = await client.request({
    query: UPSERT_METAOBJECT_MUTATION,
    variables: {
      handle: { handle, type },
      metaobject: {
        capabilities: { publishable: { status: "ACTIVE" } },
        fields: [
          { key: "slug", value: handle },
          { key: "label", value: label },
        ],
      },
    },
    accessToken,
    shopDomain,
  });

  const errors = res?.metaobjectUpsert?.userErrors ?? [];
  if (errors.length > 0) {
    console.error(`  [Shopify Error] handle="${handle}":`, errors.map((e: any) => e.message).join(", "));
    return null;
  }

  return res?.metaobjectUpsert?.metaobject ?? null;
}

async function main() {
  let session: { shop: string; accessToken: string } | null = null;

  if (!DRY_RUN) {
    session = await prisma.session.findFirst({
      where: { shop: { not: undefined } },
      orderBy: { id: "desc" },
    }) as any;
    if (!session?.accessToken) throw new Error("No Shopify session found in DB");
  }

  console.log(`Shop: ${session?.shop ?? "(dry-run, no session needed)"}${DRY_RUN ? "  [DRY RUN]" : ""}`);

  // Collect all distinct size values from external DB
  const sizeOptionDescs = await externalDB.bc_option_description.findMany({
    where: { language_id: 3, name: "Розмір" },
  });
  const sizeOptionIds = sizeOptionDescs.map((d) => d.option_id);

  const productOptionValues = await externalDB.bc_product_option_value.findMany({
    where: { option_id: { in: sizeOptionIds } },
    select: { option_value_id: true },
  });
  const distinctValueIds = [...new Set(productOptionValues.map((v) => v.option_value_id))];

  const valueDescriptions = await externalDB.bc_option_value_description.findMany({
    where: { language_id: 3, option_value_id: { in: distinctValueIds } },
  });

  const distinct = [...new Map(valueDescriptions.map((v) => [v.name, v])).values()].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true }),
  );

  console.log(`\nFound ${distinct.length} distinct size values in external DB.`);

  let created = 0;
  let skipped = 0;

  for (const v of distinct) {
    const handle = toMetaobjectHandle(v.name);
    if (!handle) {
      console.warn(`  SKIP: empty handle for value "${v.name}"`);
      continue;
    }

    const existing = await prisma.metaobject.findFirst({ where: { handle, type: ROZMIR_TYPE } });
    if (existing) {
      skipped++;
      continue;
    }

    const label = v.name.charAt(0).toUpperCase() + v.name.slice(1);
    console.log(`  CREATE: handle="${handle}"  label="${label}"`);

    if (DRY_RUN) {
      created++;
      continue;
    }

    const result = await upsertMetaobjectRaw(handle, ROZMIR_TYPE, label, session!.accessToken, session!.shop);
    if (!result) {
      console.error(`  FAILED: handle="${handle}"`);
      continue;
    }

    await prisma.metaobject.upsert({
      where: { metaobjectId: result.id },
      update: { handle: result.handle, type: result.type },
      create: { handle: result.handle, metaobjectId: result.id, type: result.type },
    });

    console.log(`  ✓ Created: handle="${result.handle}"  id="${result.id}"`);
    created++;
  }

  console.log(`\nDone. Created: ${created}  Already existed: ${skipped}`);
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    await externalDB.$disconnect();
  });
