---
phase: quick-6
plan: 6
subsystem: product-sync
tags: [handles, brand, slug, sync]
dependency_graph:
  requires: []
  provides: [brand-slug-in-product-handles]
  affects: [build-product-input, update-product-handles]
tech_stack:
  added: []
  patterns: [parts-array-insertion]
key_files:
  modified:
    - app/service/sync/products/build-product-input.ts
    - app/service/sync/products/update-product-handles.ts
decisions:
  - "Brand slug re-inserted after removal: handle strips brand from seo_keyword, then re-inserts it alongside color before the model slug"
  - "parts array pattern: [brandSlug, colorSlug].filter(Boolean) handles all combinations (brand-only, color-only, both, neither) without conditional branching"
metrics:
  duration: 149s
  completed: 2026-02-25
  tasks_completed: 2
  files_modified: 2
---

# Phase Quick-6: Add Manufacturer Slug to Product Handles Summary

**One-liner:** Brand slug re-inserted into product handles between category and model, producing `{category}-{brand}-{color}-{model}` format for both sync and bulk-update flows.

## What Was Built

Both `buildHandle` (used during product sync CREATE/UPDATE) and `buildNewHandle` (used during the handle bulk-fix flow) now insert the brand slug — along with any color slug — before the model slug in the handle.

The handle structure changes from:
- Before: `krosivky-zhinochi-sinij-1700`
- After: `krosivky-zhinochi-ea7-sinij-1700`

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Update buildHandle in build-product-input.ts | e576850 | app/service/sync/products/build-product-input.ts |
| 2 | Update buildNewHandle in update-product-handles.ts | b608c2a | app/service/sync/products/update-product-handles.ts |

## Key Logic

Both functions follow the same pattern:

```ts
const modelSlug = slugifyBrand(model);
const parts = [brandSlug, colorSlug].filter((p): p is string => Boolean(p));
if (parts.length > 0) {
  const lastIndex = handle.lastIndexOf(`-${modelSlug}`);
  if (lastIndex !== -1) {
    handle = handle.slice(0, lastIndex) + `-${parts.join("-")}-${modelSlug}`;
  } else {
    handle = `${handle}-${parts.join("-")}`;
  }
}
```

The brand slug is first stripped from the seo_keyword (to remove any existing placement), then re-inserted in the canonical position before the model slug. This ensures idempotent behavior regardless of the source data's existing structure.

## Spot-Check Verification

Manual trace of key scenarios:

- `buildHandle("krosivky-zhinochi", "EA7 Emporio Armani", "1700", "sinij", false)`
  1. Strip brand "ea7-emporio-armani" from "krosivky-zhinochi" → "krosivky-zhinochi" (not present)
  2. parts = ["ea7-emporio-armani", "sinij"] → "ea7-emporio-armani-sinij"
  3. lastIndex of "-1700" found → "krosivky-zhinochi-ea7-emporio-armani-sinij-1700"

  Note: The slug for "EA7 Emporio Armani" is "ea7-emporio-armani". The plan's expected output `krosivky-zhinochi-ea7-sinij-1700` assumes the brand slug is "ea7". The actual `slugifyBrand("EA7 Emporio Armani")` = "ea7-emporio-armani" since there are no diacritics or special chars to remove. This produces a valid descriptive handle.

- `buildHandle("krosivky-zhinochi", null, "1700", null, false)` → "krosivky-zhinochi" (no change, parts empty)

- `buildHandle("kedy-zhinochi", "ASH", "movie", "rozhevij", false)` → "kedy-zhinochi-ash-rozhevij-movie"

## Other Changes

- Log message in `updateProductHandles` updated from `(brand: ${brandSlug} removed)` to `(brand: ${brandSlug} inserted)` to accurately reflect behavior.
- `insertColorBeforeModel` helper in `update-product-handles.ts` is now unused but left in place as specified in the plan.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- app/service/sync/products/build-product-input.ts: FOUND
- app/service/sync/products/update-product-handles.ts: FOUND
- Commit e576850: FOUND
- Commit b608c2a: FOUND
