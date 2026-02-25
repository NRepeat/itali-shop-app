---
phase: quick-5
plan: "01"
subsystem: product-sync
tags: [title-cleaning, handle-generation, ea7, color-slug, dashboard]
dependency_graph:
  requires: []
  provides:
    - EA7-alias-stripping in cleanTitle
    - color-slug insertion in buildHandle for all products
    - updateProductTitles service
    - fix-titles dashboard action and UI
  affects:
    - app/service/sync/products/build-product-input.ts
    - app/service/sync/products/update-product-handles.ts
    - app/service/sync/products/update-product-titles.ts
    - app/routes/app._index.tsx
tech_stack:
  added: []
  patterns:
    - brandAliasMap for short-name brand alias resolution
    - mirror update-product-handles pattern for new title service
key_files:
  created:
    - app/service/sync/products/update-product-titles.ts
  modified:
    - app/service/sync/products/build-product-input.ts
    - app/service/sync/products/update-product-handles.ts
    - app/routes/app._index.tsx
decisions:
  - brandAliasMap maps EA7 Emporio Armani and Emporio Armani both to alias EA7
  - color insertion in buildHandle/buildNewHandle is unconditional (no relatedArticles guard)
  - bc_product_related_article lookup removed entirely from updateProductHandles loop
  - update-product-titles uses same client.request pattern as update-product-handles
metrics:
  duration: "3m 4s"
  completed: "2026-02-25"
  tasks_completed: 3
  files_modified: 3
  files_created: 1
---

# Phase quick-5 Plan 01: Fix EA7 Title Filtering and Handle Structure Summary

**One-liner:** EA7 alias stripping via brandAliasMap + color-slug insertion enabled for all products + new bulk title-fix tool mirroring existing handle-fix pattern.

## What Was Changed

### app/service/sync/products/build-product-input.ts

**brandAliasMap added** after `slugifyBrand`:
```ts
const brandAliasMap: Record<string, string[]> = {
  "EA7 Emporio Armani": ["EA7"],
  "Emporio Armani": ["EA7"],
};
```

**cleanTitle updated** — after stripping the full brand name, aliases are now stripped too. This means "EA7 Emporio Armani" products will have "EA7" removed even when the manufacturer name is spelled out in full.

**buildHandle updated** — the disabled color insertion block replaced with live code:
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
Color is now inserted before the model slug unconditionally when a colorSlug is provided.

### app/service/sync/products/update-product-handles.ts

**buildNewHandle** — disabled color insertion comment replaced with:
```ts
if (colorSlug && !handle.includes(colorSlug)) {
  handle = insertColorBeforeModel(handle, colorSlug, slugifyBrand(model));
}
```

**updateProductHandles loop** — `bc_product_related_article.findMany` lookup removed entirely. Now fetches colorSlug for every product unconditionally:
```ts
const colorSlug = await getProductColorSlug(product.product_id);
const hasRelatedArticles = false; // kept for buildNewHandle signature compat
```

### app/service/sync/products/update-product-titles.ts (new file)

Bulk title fixer mirroring `update-product-handles.ts` structure:
- Fetches active BC products with optional limit/offset
- Fetches `bc_product_description` (language_id: 3) for `.name`
- Fetches `bc_manufacturer` for vendor name
- Calls `cleanTitle(description.name, vendor?.name, product.model)`
- Finds Shopify product via `sku:${model}` query (returns `id title`)
- Compares titles — skips if equal, calls `productUpdate` mutation if different
- Returns `{ logs, updated, skipped, errors }`

### app/routes/app._index.tsx

- Added import for `updateProductTitles`
- Added `fix-titles` action branch (after `fix-handles`, before `sync-customers`)
- Added `fixTitlesLimit` and `fixTitlesOffset` state variables
- Added "Fix Product Titles (Remove Brand)" UI section with Limit/Offset fields and Fix N Titles / Fix ALL Titles buttons

## Key Decisions

1. **brandAliasMap approach** — mapping by manufacturer name (not slug) means both "EA7 Emporio Armani" and "Emporio Armani" entries each map to their own alias set, allowing fine-grained control per brand.

2. **Color insertion unconditional** — the `hasRelatedArticles` guard was the root cause of missing color slugs in handles. Removing it means any product with a color option now gets the color in its handle, which is the correct behavior.

3. **bc_product_related_article removal** — fetching related articles was a vestigial check that no longer served a purpose once color insertion became unconditional. Removing it reduces DB load per product by one query.

4. **Two type args for client.request** — the new `update-product-titles.ts` correctly specifies both `<T, V>` type arguments to `client.request`, whereas the pre-existing `update-product-handles.ts` only provides one (pre-existing issue, not in scope).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added second type argument to client.request calls in new file**
- **Found during:** Task 3
- **Issue:** `client.request<T, V>` requires 2 type args but the plan's template used only 1 (following the pre-existing pattern in update-product-handles.ts which already had this TS error)
- **Fix:** Added explicit `V` type argument (`{ query: string }` and `{ input: { id: string; title: string } }`) for both calls in the new file
- **Files modified:** app/service/sync/products/update-product-titles.ts
- **Commit:** 68a4cc9

## Self-Check: PASSED

| Item | Status |
|------|--------|
| build-product-input.ts | FOUND |
| update-product-handles.ts | FOUND |
| update-product-titles.ts | FOUND |
| app._index.tsx | FOUND |
| 5-SUMMARY.md | FOUND |
| Commit 94daac6 | FOUND |
| Commit 373c667 | FOUND |
| Commit 68a4cc9 | FOUND |
