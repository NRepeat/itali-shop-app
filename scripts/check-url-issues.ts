/**
 * Check all Shopify product handles for SEO URL issues:
 *   - spaces in handle
 *   - double slashes (after prefixing /products/)
 *   - trailing/leading slashes
 *
 * Run: dotenv -e .env tsx scripts/check-url-issues.ts
 */

import { PrismaClient } from "prisma/generated/app_client/client";

const prisma = new PrismaClient();

const QUERY = `
  query getProducts($cursor: String) {
    products(first: 250, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes { id handle title }
    }
  }
`;

async function main() {
  const session = await prisma.session.findFirst({
    where: { isOnline: false },
    select: { shop: true, accessToken: true },
  });

  if (!session?.accessToken) {
    console.error("No offline session found");
    process.exit(1);
  }

  const { shop, accessToken } = session;
  console.log(`Shop: ${shop}\n`);

  const apiVersion = process.env.SHOPIFY_API_VERSION ?? "2025-01";
  const url = `https://${shop}/admin/api/${apiVersion}/graphql.json`;

  const withSpaces:        string[] = [];
  const withDoubleSlash:   string[] = [];
  const withLeadingSlash:  string[] = [];
  const withTrailingSlash: string[] = [];

  let cursor: string | null = null;
  let page = 0;
  let total = 0;

  do {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: QUERY, variables: { cursor } }),
    });

    const json: any = await res.json();
    if (json.errors) {
      console.error("GraphQL errors:", JSON.stringify(json.errors));
      process.exit(1);
    }

    const products: Array<{ id: string; handle: string; title: string }> =
      json.data?.products?.nodes ?? [];
    const pageInfo = json.data?.products?.pageInfo;

    page++;
    total += products.length;
    process.stdout.write(`\rPage ${page} — ${total} products scanned...`);

    for (const p of products) {
      const fmt = `${p.handle}  |  ${p.title}`;
      if (/ /.test(p.handle))               withSpaces.push(fmt);
      if (/\/\//.test(`/products/${p.handle}`)) withDoubleSlash.push(fmt);
      if (p.handle.startsWith("/"))          withLeadingSlash.push(fmt);
      if (p.handle.endsWith("/"))            withTrailingSlash.push(fmt);
    }

    cursor = pageInfo?.hasNextPage ? pageInfo.endCursor : null;
  } while (cursor);

  console.log(`\n\nScanned ${total} products.\n`);

  const print = (label: string, list: string[]) => {
    console.log(`=== ${label} (${list.length}) ===`);
    list.slice(0, 50).forEach((l) => console.log(" ", l));
    if (list.length > 50) console.log(`  ... and ${list.length - 50} more`);
    console.log();
  };

  print("Spaces in handle",    withSpaces);
  print("Double slashes",      withDoubleSlash);
  print("Leading slash",       withLeadingSlash);
  print("Trailing slash",      withTrailingSlash);

  const total_issues = withSpaces.length + withDoubleSlash.length +
    withLeadingSlash.length + withTrailingSlash.length;

  if (total_issues === 0) {
    console.log("✓ No issues found.");
  } else {
    console.log(`⚠ ${total_issues} issue(s) found.`);
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
