---
plan: 05-06
phase: 05-email-improvements-and-frontend-fixes
status: complete
completed: 2026-03-04
---

# Plan 05-06 Summary: SKU-First Related Products

## What Was Built

Promoted SKU-based related product lookup from fallback to primary source in `ProductSessionView.tsx`.

## Key Changes

### `/Users/mnmac/Development/nnshop/src/features/product/ui/ProductSessionView.tsx`
- Removed `getReletedProducts` from the initial `Promise.all` batch
- New priority order:
  1. `getProductsBySku` — primary (up to 3 products by SKU match)
  2. `getReletedProducts` — fills remaining slots from `recommended_products` metafield
  3. `getNewProductsFiller` — fills remaining slots from product type
- Previously SKU was a last-resort filler; now it is first priority

## Commits

| Commit | Message |
|--------|---------|
| c7a1f11 | feat(05-06): promote SKU-based lookup to primary related products source |

## Self-Check: PASSED

- ✓ `getProductsBySku` called first, before metafield/type lookups
- ✓ Metafield lookup fills remaining slots (not replaced)
- ✓ Product type filler still works as final fallback
- ✓ `product.id` excluded from all results
