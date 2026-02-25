---
phase: quick-13
plan: 13
subsystem: sync/products
tags: [cleanTitle, handle, titles, fix]
dependency_graph:
  requires: []
  provides: [case-insensitive model strip in cleanTitle, sku double-pass in updateProductTitles]
  affects: [build-product-input.ts, update-product-titles.ts]
tech_stack:
  added: []
  patterns: [case-insensitive regex flag "gi", second cleanTitle pass guarded by sku/model diff and digit check]
key_files:
  created: []
  modified:
    - app/service/sync/products/build-product-input.ts
    - app/service/sync/products/update-product-titles.ts
decisions:
  - "Case-insensitive model strip: regex flag changed from 'g' to 'gi' so lowercase model (e.g. 3dpf78) matches uppercase article in title (e.g. 3DPF78)"
  - "SKU second-pass guard: only fires when sku exists, sku !== model, and sku contains a digit — avoids stripping alphanumeric descriptive model names"
  - "cleanTitle accepts null for brandName argument (already guarded by 'if (brandName)'), so second pass safely skips brand stripping"
metrics:
  duration: 61s
  completed: 2026-02-25
  tasks_completed: 2
  files_modified: 2
---

# Phase quick-13: Fix cleanTitle model SKU stripping — case-insensitive + sku double-pass

**One-liner:** Case-insensitive "gi" regex flag in cleanTitle plus a second sku-based strip pass in updateProductTitles, removing uppercase article numbers (e.g. 3DPF78) that the old case-sensitive regex missed.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Make cleanTitle model-strip regex case-insensitive | f5445b7 | app/service/sync/products/build-product-input.ts |
| 2 | Fetch and strip bc_product.sku in updateProductTitles | 3fef875 | app/service/sync/products/update-product-titles.ts |

## Changes Made

### Task 1 — build-product-input.ts (line 70)

Changed `"g"` to `"gi"` in the model-strip regex inside `cleanTitle`:

```typescript
// Before
t = t.replace(new RegExp(`(^|\\s)${escapedModel}(?=\\s|$)`, "g"), " ");

// After
t = t.replace(new RegExp(`(^|\\s)${escapedModel}(?=\\s|$)`, "gi"), " ");
```

**Effect:** `cleanTitle("Футболка-поло чоловіча 3DPF78", null, "3dpf78")` now returns `"Футболка-поло чоловіча"` — the uppercase article number matches the lowercase model.

### Task 2 — update-product-titles.ts

**Select block:** Added `sku: true` so `bc_product.sku` is fetched alongside `model` and `manufacturer_id`.

**Second strip pass:** After the primary `cleanTitle` call, a second pass strips the sku token when:
- `product.sku` is present
- `product.sku !== product.model` (avoids double-stripping)
- `/\d/.test(product.sku)` is true (only strip numeric/alphanumeric article codes, not descriptive text)

```typescript
let newTitle = cleanTitle(description.name, vendor?.name, product.model);
if (product.sku && product.sku !== product.model && /\d/.test(product.sku)) {
  newTitle = cleanTitle(newTitle, null, product.sku);
}
```

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

### Files exist:
- app/service/sync/products/build-product-input.ts — FOUND
- app/service/sync/products/update-product-titles.ts — FOUND

### Commits exist:
- f5445b7 — FOUND
- 3fef875 — FOUND

## Self-Check: PASSED
