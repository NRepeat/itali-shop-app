# Quick Task 14: Fix Handle Duplicate Colors — Add Feminine Ukrainian Color Slug Variants

## Problem

`buildNewHandle` strips known color slugs before inserting the canonical color. The strip list is built from `colorMapping` values, which are masculine adjective forms (e.g. `"fioletovij"`, `"rozhevij"`). Women's products use feminine adjective forms in their `seo_keyword` (e.g. `"fioletova"`, `"rozheva"`). These feminine forms are not stripped, causing duplicate color segments in the resulting handle:

```
futbolka-cholovicha-fioletova-ea7-emporio-armani-fioletovij-8npt18
```

## Root Cause

Line ~123 in `update-product-handles.ts`:

```typescript
const colorsToStrip = [...new Set([...Object.values(colorMapping), "synij", "bilyi", "chornyi"])];
```

`colorMapping` values are all masculine forms. Feminine forms are not included.

## Fix

Add a module-level `feminineColorSlugs` array near `colorMapping` (after line 28), then include it in `colorsToStrip`.

Masculine → Feminine mapping pattern:
- `-vij` → `-va`
- `-nij` → `-na`
- `-ij` → `-a` (for short stems like `rudij` → `ruda`, `sirij` → `sira`)

Noun-form colors (`sriblo`, `zoloto`, `haki`, `multikolor`, `piton`) have no feminine form and are kept as-is.

## Files Changed

- `app/service/sync/products/update-product-handles.ts`

## Verification

After the fix, handles for women's products whose `seo_keyword` contains feminine color adjectives will have those adjectives stripped before the canonical masculine color slug is inserted, preventing duplication.
