---
phase: quick-1
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - app/service/shopify/metaobjects/getMetaobjectByHandle.ts
  - app/service/sync/products/shopify-product-builder.ts
autonomous: true
requirements: []
must_haves:
  truths:
    - "ensureMetaobject never attempts a duplicate create when the metaobject already exists in Shopify"
    - "When local DB misses but Shopify has the record, local DB is backfilled and the existing GID is returned"
    - "When both local DB and Shopify miss, a new metaobject is created and persisted as before"
  artifacts:
    - path: "app/service/shopify/metaobjects/getMetaobjectByHandle.ts"
      provides: "Shopify GraphQL query for a single metaobject by handle+type"
      exports: ["getMetaobjectByHandle"]
    - path: "app/service/sync/products/shopify-product-builder.ts"
      provides: "ensureMetaobject with three-step lookup: local DB -> Shopify -> create"
      contains: "getMetaobjectByHandle"
  key_links:
    - from: "app/service/sync/products/shopify-product-builder.ts"
      to: "app/service/shopify/metaobjects/getMetaobjectByHandle.ts"
      via: "import and call in ensureMetaobject"
      pattern: "getMetaobjectByHandle"
    - from: "app/service/sync/products/shopify-product-builder.ts"
      to: "prisma.metaobject.upsert"
      via: "backfill after Shopify lookup"
      pattern: "prisma\\.metaobject\\.upsert"
---

<objective>
Fix `ensureMetaobject` in `shopify-product-builder.ts` to query Shopify by handle+type when the local DB lookup misses, before attempting a create. Upsert the local DB record from the Shopify response on hit. This prevents duplicate-create errors when a metaobject exists in Shopify but is absent from the local DB (e.g., after a crashed sync run).

Purpose: Eliminates silent failures where `metaobjectCreate` returns null due to a DUPLICATE_VALUE error, causing option/metafield values to be dropped from the synced product.
Output: A new `getMetaobjectByHandle.ts` utility and an updated `ensureMetaobject` with three-step lookup.
</objective>

<execution_context>
@/Users/mnmac/.claude/get-shit-done/workflows/execute-plan.md
@/Users/mnmac/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@app/service/sync/products/shopify-product-builder.ts
@app/service/shopify/metaobjects/createMetaobject.ts
@app/service/shopify/metaobjects/getMetaobject.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add getMetaobjectByHandle Shopify query</name>
  <files>app/service/shopify/metaobjects/getMetaobjectByHandle.ts</files>
  <action>
Create a new file `app/service/shopify/metaobjects/getMetaobjectByHandle.ts` that queries Shopify for a single metaobject by handle and type using the `metaobjectByHandle` GraphQL query.

The function signature:
```ts
export const getMetaobjectByHandle = async (
  admin: AdminApiContext,
  handle: string,
  type: string,
): Promise<{ id: string; handle: string; type: string } | null>
```

GraphQL query to use:
```graphql
query GetMetaobjectByHandle($handle: MetaobjectHandleInput!) {
  metaobjectByHandle(handle: $handle) {
    id
    handle
    type
  }
}
```

The `MetaobjectHandleInput` takes `{ handle: string, type: string }`. Pass `{ handle, type }` as the `handle` variable.

Return the `metaobjectByHandle` node if present, or `null` if not found or on error. Wrap in try/catch and log errors via `console.error`. Follow the same pattern as `createMetaobject.ts` — use `admin.graphql(query, { variables })` and return `res.data?.metaobjectByHandle ?? null`.

Import `AdminApiContext` from `@shopify/shopify-app-react-router/server`.
  </action>
  <verify>
    <automated>npx tsc --noEmit 2>&1 | grep getMetaobjectByHandle || echo "no type errors in new file"</automated>
    <manual>File exists at app/service/shopify/metaobjects/getMetaobjectByHandle.ts and exports getMetaobjectByHandle</manual>
  </verify>
  <done>File exists, exports `getMetaobjectByHandle`, compiles without TypeScript errors.</done>
</task>

<task type="auto">
  <name>Task 2: Update ensureMetaobject with three-step lookup</name>
  <files>app/service/sync/products/shopify-product-builder.ts</files>
  <action>
Update the `ensureMetaobject` function (lines 30-69) in `shopify-product-builder.ts` to add a Shopify lookup step between the local DB check and the create call.

Import `getMetaobjectByHandle` at the top of the file alongside the existing `createMetaobject` import.

New three-step logic for `ensureMetaobject`:

**Step 1 — Local DB lookup (unchanged):**
```ts
const existing = await prisma.metaobject.findFirst({ where: { handle, type } });
if (existing) return existing.metaobjectId;
```

**Step 2 — Shopify lookup (NEW):**
```ts
const fromShopify = await getMetaobjectByHandle(admin, handle, type);
if (fromShopify) {
  // Backfill local DB so future calls hit the fast path
  await prisma.metaobject.upsert({
    where: { handle },
    update: { metaobjectId: fromShopify.id, type: fromShopify.type },
    create: { handle, metaobjectId: fromShopify.id, type: fromShopify.type },
  });
  console.log(`[ensureMetaobject] Backfilled from Shopify handle="${handle}" type="${type}" id="${fromShopify.id}"`);
  return fromShopify.id;
}
```

**Step 3 — Create (unchanged, runs only when both lookups miss):**
The existing `createMetaobject` call and subsequent `prisma.metaobject.upsert` remain exactly as they are now.

Do not change any other logic in the file. The `slugifyHandle` helper, `buildProductOptions`, `buildProductVariants`, `buildTags`, `buildFiles`, and `buildMetafields` exports must remain untouched.
  </action>
  <verify>
    <automated>npx tsc --noEmit 2>&1 | grep shopify-product-builder || echo "no type errors"</automated>
    <manual>Review ensureMetaobject — confirm three steps are present: prisma lookup, getMetaobjectByHandle lookup with DB backfill, then createMetaobject.</manual>
  </verify>
  <done>
    `ensureMetaobject` contains all three steps. TypeScript compiles cleanly. A metaobject that exists in Shopify but not in the local DB will be found in Step 2, backfilled, and returned — no duplicate create attempted.
  </done>
</task>

</tasks>

<verification>
After both tasks complete:
1. `npx tsc --noEmit` passes with no new errors
2. Manually inspect `ensureMetaobject` to confirm the three-step structure
3. Grep for the backfill log message to confirm it's wired: `grep "Backfilled from Shopify" app/service/sync/products/shopify-product-builder.ts`
</verification>

<success_criteria>
- `app/service/shopify/metaobjects/getMetaobjectByHandle.ts` exists and exports `getMetaobjectByHandle`
- `ensureMetaobject` in `shopify-product-builder.ts` queries Shopify before attempting create
- A metaobject present in Shopify but absent from local DB is backfilled without triggering a duplicate create error
- TypeScript compiles without errors
</success_criteria>

<output>
After completion, create `.planning/quick/1-check-metaobject-upsert-logic-in-product/1-SUMMARY.md` following the standard summary template.
</output>
