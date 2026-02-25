---
phase: quick-5
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - app/service/sync/products/build-product-input.ts
  - app/service/sync/products/update-product-handles.ts
  - app/service/sync/products/update-product-titles.ts
  - app/routes/app._index.tsx
autonomous: true
requirements: []
must_haves:
  truths:
    - "EA7 is stripped from product titles even when manufacturer name is 'EA7 Emporio Armani' or 'Emporio Armani'"
    - "Product handles include color slug before model slug for ALL products (not just those with related articles)"
    - "Dashboard has a Fix Product Titles section with limit/offset controls and Fix / Fix ALL buttons"
    - "fix-titles action calls updateProductTitles and returns logs"
  artifacts:
    - path: "app/service/sync/products/build-product-input.ts"
      provides: "brandAliasMap, updated cleanTitle strips aliases, updated buildHandle enables color insertion"
    - path: "app/service/sync/products/update-product-handles.ts"
      provides: "buildNewHandle enables color for all products, relatedArticles guard removed"
    - path: "app/service/sync/products/update-product-titles.ts"
      provides: "updateProductTitles service — same pattern as update-product-handles.ts"
    - path: "app/routes/app._index.tsx"
      provides: "fix-titles action branch, fixTitlesLimit/fixTitlesOffset state, UI section"
  key_links:
    - from: "app/routes/app._index.tsx"
      to: "app/service/sync/products/update-product-titles.ts"
      via: "import updateProductTitles, call in action fix-titles branch"
    - from: "app/service/sync/products/update-product-titles.ts"
      to: "cleanTitle in build-product-input.ts"
      via: "import { cleanTitle }"
    - from: "app/service/sync/products/update-product-handles.ts"
      to: "getProductColorSlug"
      via: "called for ALL products, hasRelatedArticles guard removed"
---

<objective>
Fix two distinct EA7/handle bugs and expose a new bulk title-fix tool in the dashboard.

Purpose: EA7 product titles retain "EA7" because the manufacturer name "EA7 Emporio Armani" doesn't match the in-title abbreviation. Handle color insertion is disabled for all products, producing handles without color slugs.

Output:
- `build-product-input.ts` — brandAliasMap + alias-aware cleanTitle + color-enabled buildHandle
- `update-product-handles.ts` — color insertion enabled for ALL products
- `update-product-titles.ts` — new bulk title fixer (mirrors update-product-handles.ts pattern)
- `app._index.tsx` — fix-titles action + UI section
</objective>

<execution_context>
@/Users/mnmac/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@/Users/mnmac/Development/itali-shop-app/app/service/sync/products/build-product-input.ts
@/Users/mnmac/Development/itali-shop-app/app/service/sync/products/update-product-handles.ts
@/Users/mnmac/Development/itali-shop-app/app/routes/app._index.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix cleanTitle alias stripping and enable color in buildHandle (build-product-input.ts)</name>
  <files>app/service/sync/products/build-product-input.ts</files>
  <action>
Make two targeted changes to this file:

**Change 1 — brandAliasMap + alias-aware cleanTitle:**

After the `slugifyBrand` function (line 31), add the alias map:

```ts
const brandAliasMap: Record<string, string[]> = {
  "EA7 Emporio Armani": ["EA7"],
  "Emporio Armani": ["EA7"],
};
```

Then update `cleanTitle` to also strip aliases. After the block that strips `brandName` (the existing `if (brandName) { ... }` block), add:

```ts
  if (brandName) {
    const aliases = brandAliasMap[brandName] ?? [];
    for (const alias of aliases) {
      const escapedAlias = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      t = t.replace(new RegExp(escapedAlias, "gi"), "");
    }
  }
```

This goes right after the closing brace of the existing `if (brandName)` block inside `cleanTitle`, before the model-stripping block.

**Change 2 — Enable color insertion in buildHandle:**

Replace the disabled comment block (lines 82-83):
```ts
  // Color insertion disabled — add when needed
  // if (hasRelatedArticles && colorSlug && !handle.includes(colorSlug)) { ... }
```

With the following inline color insertion (place it after `handle = handle.replace(/-+/g, "-").replace(/^-|-$/g, "");` and before `return handle;`):

```ts
  if (colorSlug && !handle.includes(colorSlug)) {
    const modelSlug = slugifyBrand(model);
    const lastIndex = handle.lastIndexOf(`-${modelSlug}`);
    if (lastIndex !== -1) {
      handle = handle.slice(0, lastIndex) + `-${colorSlug}-${modelSlug}`;
    } else {
      handle = `${handle}-${colorSlug}`;
    }
  }
```

Note: `hasRelatedArticles` param is kept in the function signature to avoid breaking callers — just do not condition on it for color insertion.
  </action>
  <verify>
    <automated>cd /Users/mnmac/Development/itali-shop-app && npx tsc --noEmit 2>&1 | head -30</automated>
    <manual>Confirm cleanTitle("Футболка чоловіча EA7 синя 3DPT29", "EA7 Emporio Armani", "3DPT29") returns "Футболка чоловіча синя" (EA7 and 3DPT29 removed).</manual>
  </verify>
  <done>TypeScript compiles clean. buildHandle produces handles with colorSlug before modelSlug when colorSlug is provided. cleanTitle strips both the full manufacturer name AND any aliases (e.g. "EA7") from the title.</done>
</task>

<task type="auto">
  <name>Task 2: Enable color insertion for ALL products in update-product-handles.ts</name>
  <files>app/service/sync/products/update-product-handles.ts</files>
  <action>
Make two targeted changes:

**Change 1 — buildNewHandle: enable color insertion unconditionally:**

Replace the disabled comment in `buildNewHandle` (lines 112-113):
```ts
  // Color insertion disabled — add when needed
  // if (hasRelatedArticles && colorSlug) { ... }
```

With:
```ts
  if (colorSlug && !handle.includes(colorSlug)) {
    handle = insertColorBeforeModel(handle, colorSlug, slugifyBrand(model));
  }
```

`insertColorBeforeModel` is already defined at line 82 in this file — no import needed.

**Change 2 — updateProductHandles loop: fetch colorSlug for ALL products:**

In the per-product loop, find this block (lines 218-227):
```ts
      // Check if product has related articles (color variants)
      const relatedArticles = await externalDB.bc_product_related_article.findMany({
        where: { article_id: product.product_id },
        select: { product_id: true },
      });
      const hasRelatedArticles = relatedArticles.length > 0;

      let colorSlug: string | null = null;
      if (hasRelatedArticles) {
        colorSlug = await getProductColorSlug(product.product_id);
      }
```

Replace with:
```ts
      const colorSlug = await getProductColorSlug(product.product_id);
      const hasRelatedArticles = false; // kept for buildNewHandle signature compat
```

This removes the `bc_product_related_article` lookup entirely and fetches color for every product.
  </action>
  <verify>
    <automated>cd /Users/mnmac/Development/itali-shop-app && npx tsc --noEmit 2>&1 | head -30</automated>
  </verify>
  <done>TypeScript compiles clean. buildNewHandle now inserts colorSlug before modelSlug for any product that has a color slug, regardless of related articles. The `bc_product_related_article` query is no longer executed.</done>
</task>

<task type="auto">
  <name>Task 3: Create update-product-titles.ts and wire fix-titles into dashboard</name>
  <files>
    app/service/sync/products/update-product-titles.ts
    app/routes/app._index.tsx
  </files>
  <action>
**Part A — Create app/service/sync/products/update-product-titles.ts:**

Mirror the structure of `update-product-handles.ts`. The service:
1. Fetches active BC products from `externalDB` (same `findMany` call: `status: true`, select `product_id`, `model`, `manufacturer_id`), with `skip: offset` and optional `take: limit`.
2. For each product, fetches `bc_product_description` (language_id: 3) to get `.name` (the title).
3. Fetches `bc_manufacturer` for `vendor.name` (same pattern as update-product-handles).
4. Calls `cleanTitle(description.name, vendor?.name, product.model)` — import `cleanTitle` from `./build-product-input`.
5. Finds the product in Shopify via `FIND_PRODUCT_BY_SKU_QUERY` (`sku:${product.model}`) — same query as update-product-handles but returns `id title` instead of `id handle`.
6. Compares `shopifyProduct.title` to `newTitle` — if equal, skip.
7. If different, calls `productUpdate` mutation with `{ id: shopifyProduct.id, title: newTitle }`.
8. Returns `{ logs, updated, skipped, errors }`.

Use the same `client.request` pattern (import `client` from `../../sync/client/shopify`), same logging pattern (`log` helper).

GraphQL query for finding product:
```graphql
query findProductBySku($query: String!) {
  products(first: 1, query: $query) {
    nodes {
      id
      title
    }
  }
}
```

GraphQL mutation for updating title:
```graphql
mutation productUpdate($input: ProductInput!) {
  productUpdate(input: $input) {
    product { id title }
    userErrors { field message }
  }
}
```

Export: `export async function updateProductTitles(accessToken, shopDomain, limit?, offset = 0)`

**Part B — Wire into app/routes/app._index.tsx:**

1. Add import at top (after `updateProductHandles` import line):
   ```ts
   import { updateProductTitles } from "@/service/sync/products/update-product-titles";
   ```

2. Add action branch inside the `action` function, after the `fix-handles` else-if block and before the `sync-customers` else-if:
   ```ts
   } else if (body.action === "fix-titles") {
     const limit = body.limit ? Number(body.limit) : undefined;
     const offset = body.offset ? Number(body.offset) : 0;
     const result = await updateProductTitles(
       session.accessToken!,
       session.shop,
       limit,
       offset,
     );
     logs = result.logs;
   }
   ```

3. Add state in the `Index` component (after the `fixHandlesOffset` state line):
   ```ts
   const [fixTitlesLimit, setFixTitlesLimit] = useState("100");
   const [fixTitlesOffset, setFixTitlesOffset] = useState("0");
   ```

4. Add the UI section after the "Fix Product Handles (Remove Brand)" `</s-section>` closing tag and before the "Sync Customers" `<s-section>`:
   ```jsx
   <s-section heading="Fix Product Titles (Remove Brand)">
     <div style={{ marginBottom: "12px", color: "#666", fontSize: "14px" }}>
       Re-computes product titles by removing brand name and model SKU
     </div>
     <div style={{ display: "flex", gap: "8px", alignItems: "flex-end", flexWrap: "wrap" as const }}>
       <s-text-field label="Limit" type="number" value={fixTitlesLimit} min="1"
         onInput={(e: any) => setFixTitlesLimit(e.target.value)}
         help-text="Number of products to process" />
       <s-text-field label="Offset" type="number" value={fixTitlesOffset} min="0"
         onInput={(e: any) => setFixTitlesOffset(e.target.value)}
         help-text="Skip first N products" />
       <s-button variant="primary"
         onClick={() => handleAction("fix-titles", fixTitlesLimit, fixTitlesOffset)}
         disabled={isLoading || undefined}>
         {isLoading && fetcher.json?.action === "fix-titles" && fetcher.json?.limit ? "Fixing..." : `Fix ${fixTitlesLimit} Titles`}
       </s-button>
       <s-button variant="primary" tone="critical"
         onClick={() => handleAction("fix-titles")}
         disabled={isLoading || undefined}>
         {isLoading && fetcher.json?.action === "fix-titles" && !fetcher.json?.limit ? "Fixing all..." : "Fix ALL Titles"}
       </s-button>
     </div>
   </s-section>
   ```
  </action>
  <verify>
    <automated>cd /Users/mnmac/Development/itali-shop-app && npx tsc --noEmit 2>&1 | head -30</automated>
  </verify>
  <done>TypeScript compiles clean. `update-product-titles.ts` exists and exports `updateProductTitles`. Dashboard action handles "fix-titles". Dashboard UI shows "Fix Product Titles (Remove Brand)" section with Limit, Offset fields and Fix/Fix ALL buttons.</done>
</task>

</tasks>

<verification>
Full compile check: `cd /Users/mnmac/Development/itali-shop-app && npx tsc --noEmit`

Zero TypeScript errors expected across all four modified/created files.
</verification>

<success_criteria>
- cleanTitle("Футболка чоловіча EA7 синя 3DPT29", "EA7 Emporio Armani", "3DPT29") returns "Футболка чоловіча синя"
- buildHandle("krosivky-zhinochi-1700", "Brand", "1700", "sinij", false) returns "krosivky-zhinochi-sinij-1700"
- update-product-handles.ts fetches colorSlug for every product (no relatedArticles guard)
- update-product-titles.ts exists, exports updateProductTitles, follows same pattern as update-product-handles.ts
- Dashboard "fix-titles" action and UI section present and functional
- Zero TypeScript errors
</success_criteria>

<output>
After completion, create `.planning/quick/5-fix-ea7-title-filtering-and-handle-struc/5-SUMMARY.md` with:
- What was changed in each file
- Key decisions (e.g. alias map entries, color-for-all approach)
- Any edge cases encountered
</output>
