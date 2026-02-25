# Quick Task 14: Fix Handle Duplicate Colors — Add Feminine Color Slug Variants

## One-liner

Added `feminineColorSlugs` module-level array and included it in `colorsToStrip` inside `buildNewHandle`, preventing duplicate color segments when women's `seo_keyword` values use feminine adjective forms like `fioletova` alongside the canonical masculine `fioletovij`.

## What Was Done

Added an 18-element `feminineColorSlugs` const immediately after `colorMapping` (line 30-35) in `update-product-handles.ts`:

```typescript
const feminineColorSlugs = [
  "fioletova", "rozheva", "blakitna", "korichneva", "girchichna",
  "bordova", "chervona", "zelena", "zhovta", "pomarancheva",
  "ruda", "sina", "synja", "chorna", "bila", "bronzova", "sira", "m-jatna",
];
```

Updated the `colorsToStrip` line in `buildNewHandle` to spread `feminineColorSlugs` into the Set:

```typescript
const colorsToStrip = [...new Set([...Object.values(colorMapping), ...feminineColorSlugs, "synij", "bilyi", "chornyi"])];
```

## Root Cause

Ukrainian color adjectives have grammatical gender. `colorMapping` stores masculine nominative forms (e.g. `"fioletovij"`). Women's product `seo_keyword` fields use feminine forms (e.g. `"fioletova"`). The strip loop only iterated `colorMapping` values plus a few manual extras, so feminine slugs survived into the handle, producing doubles like:

```
futbolka-cholovicha-fioletova-ea7-emporio-armani-fioletovij-8npt18
```

After the fix the feminine slug is stripped before the canonical masculine slug is inserted:

```
futbolka-cholovicha-ea7-emporio-armani-fioletovij-8npt18
```

## Files Modified

- `app/service/sync/products/update-product-handles.ts` — added `feminineColorSlugs`, updated `colorsToStrip`

## Commit

- `205cb78` — fix(handles): add feminine Ukrainian color slug variants to strip list in buildNewHandle

## Deviations

None — plan executed exactly as written.
