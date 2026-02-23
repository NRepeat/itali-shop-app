---
phase: quick-2
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - app/service/sync/products/shopify-product-builder.ts
autonomous: true
requirements:
  - QUICK-2

must_haves:
  truths:
    - "ensureMetaobject always queries Shopify first before consulting local DB"
    - "A metaobject deleted from Shopify is never returned as a valid GID from the local DB stale cache"
    - "After a Shopify hit, local DB is still updated as a write-through cache"
    - "After a create, local DB is still persisted as before"
  artifacts:
    - path: "app/service/sync/products/shopify-product-builder.ts"
      provides: "ensureMetaobject with Shopify-first lookup order"
      contains: "getMetaobjectByHandle called before any prisma.metaobject.findFirst"
  key_links:
    - from: "ensureMetaobject"
      to: "getMetaobjectByHandle"
      via: "first call in function body (before any DB read)"
      pattern: "getMetaobjectByHandle"
---

<objective>
Make Shopify the authoritative source of truth in `ensureMetaobject` by removing the initial local DB read.

Purpose: The current code checks `prisma.metaobject.findFirst` first, which can return a stale GID for a metaobject that was deleted in Shopify. This causes invalid references in `productSet` calls. Shopify is the master; local DB is only a write-through cache.

Output: `ensureMetaobject` in `shopify-product-builder.ts` with the local DB pre-check removed, Shopify queried first, and DB still updated on Shopify hit or creation.
</objective>

<execution_context>
@/Users/mnmac/.claude/get-shit-done/workflows/execute-plan.md
@/Users/mnmac/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove local DB pre-check from ensureMetaobject, make Shopify the first lookup</name>
  <files>app/service/sync/products/shopify-product-builder.ts</files>
  <action>
In `ensureMetaobject` (lines 31-82), delete the two lines that read from local DB before the Shopify query:

```ts
// DELETE THESE TWO LINES (currently lines 39-40):
const existing = await prisma.metaobject.findFirst({ where: { handle, type } });
if (existing) return existing.metaobjectId;
```

After deletion, the function body must read in this order:
1. `getMetaobjectByHandle(admin, handle, type)` — Shopify authoritative check (already present at what is currently line 42)
2. If found → `prisma.metaobject.upsert` to update cache, return `fromShopify.id` (already present)
3. `createMetaobject(...)` — create in Shopify if not found (already present)
4. `prisma.metaobject.upsert` to persist new creation, return `created.id` (already present)

Update the JSDoc comment above the function to reflect the new behavior:
```ts
/**
 * Looks up a metaobject by handle+type in Shopify (authoritative).
 * If found in Shopify, upserts local DB as a write-through cache and returns the GID.
 * If not found in Shopify, creates it and persists to local DB.
 * Returns the Shopify GID, or null on failure.
 */
```

Do NOT change any other logic in the function. The upsert calls, createMetaobject call, and console.log statements remain exactly as-is.
  </action>
  <verify>
    <automated>npx tsc --noEmit 2>&1 | grep shopify-product-builder || echo "no type errors in target file"</automated>
    <manual>Confirm `prisma.metaobject.findFirst` no longer appears inside `ensureMetaobject`. The first async call in the function body must be `getMetaobjectByHandle`.</manual>
  </verify>
  <done>`ensureMetaobject` contains no `prisma.metaobject.findFirst` call. TypeScript compiles without errors in the file. The Shopify lookup is the first operation executed.</done>
</task>

</tasks>

<verification>
1. `grep -n "findFirst" app/service/sync/products/shopify-product-builder.ts` returns no results inside `ensureMetaobject`
2. `grep -n "getMetaobjectByHandle" app/service/sync/products/shopify-product-builder.ts` shows it as the first substantive call in the function
3. `npx tsc --noEmit` passes without new errors
</verification>

<success_criteria>
- `ensureMetaobject` never reads from local DB before querying Shopify
- Stale local DB records cannot short-circuit the Shopify lookup
- Local DB is still written after every Shopify hit or creation (write-through cache intact)
- No TypeScript errors introduced
</success_criteria>

<output>
After completion, create `.planning/quick/2-make-shopify-source-of-truth-in-ensureme/2-SUMMARY.md` using the summary template.
</output>
