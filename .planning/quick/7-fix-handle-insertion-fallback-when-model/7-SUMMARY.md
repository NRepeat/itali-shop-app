# Quick Task 7 Summary: Fix handle insertion fallback when model slug not in handle

## Problem
When `seo_keyword` already encodes brand/style (e.g. `sportyvnyj-cholovichyj-kostyum-ea7-monogram`)
and model (`3DPV03` → slug `3dpv03`) is NOT the last segment of the handle:
- `lastIndex = handle.lastIndexOf("-3dpv03")` → -1
- `else` fallback appended brand to the end: `...kostyum-ea7-monogram-ea7-emporio-armani`

## Fix
Removed the `else` fallback in both files — if model slug is not found at the end of the handle,
the handle is left untouched (the seo_keyword already has the right structure).

## Files Changed
- `app/service/sync/products/build-product-input.ts` — `buildHandle`: removed else fallback
- `app/service/sync/products/update-product-handles.ts` — `buildNewHandle`: removed else fallback

## Result
- `sportyvnyj-cholovichyj-kostyum-ea7-monogram` → stays unchanged ✓
- `krosivky-zhinochi-1700` + brand ea7 + color sinij → `krosivky-zhinochi-ea7-sinij-1700` ✓ (model found, still works)

## Commit
174ffb5
