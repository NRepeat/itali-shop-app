---
phase: quick-6
plan: 6
type: execute
wave: 1
depends_on: []
files_modified:
  - app/service/sync/products/build-product-input.ts
  - app/service/sync/products/update-product-handles.ts
autonomous: true
requirements: [QUICK-6]
must_haves:
  truths:
    - "Product handles include the brand slug between category and color (e.g. krosivky-zhinochi-ea7-sinij-1700)"
    - "Products with no brand (vendor null) keep their current handle structure unchanged"
    - "Products with no color still receive the brand slug inserted before the model"
  artifacts:
    - path: "app/service/sync/products/build-product-input.ts"
      provides: "buildHandle with brand+color insertion"
      contains: "parts.join"
    - path: "app/service/sync/products/update-product-handles.ts"
      provides: "buildNewHandle with brand+color insertion"
      contains: "parts.join"
  key_links:
    - from: "app/service/sync/products/build-product-input.ts"
      to: "buildHandle return value"
      via: "parts array combining brandSlugForInsert + colorSlug"
    - from: "app/service/sync/products/update-product-handles.ts"
      to: "buildNewHandle return value"
      via: "parts array combining brandSlug + colorSlug"
---

<objective>
Insert the manufacturer/brand slug into product handles, changing the format from
`{category}-{color}-{model}` to `{category}-{brand}-{color}-{model}`.

Purpose: Makes handles more descriptive and consistent with product identity (brand is part of the slug identity, not removed).
Output: Updated `buildHandle` and `buildNewHandle` functions; handle bulk-fix flow will apply the new format to all existing products.
</objective>

<context>
@/Users/mnmac/Development/itali-shop-app/app/service/sync/products/build-product-input.ts
@/Users/mnmac/Development/itali-shop-app/app/service/sync/products/update-product-handles.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Update buildHandle in build-product-input.ts to insert brand + color before model</name>
  <files>app/service/sync/products/build-product-input.ts</files>
  <action>
Replace the color-only insertion block in `buildHandle` (lines 95-103) with a brand+color insertion block.

Current block to remove:
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

Replace with:
```ts
const modelSlug = slugifyBrand(model);
const brandSlugForInsert = brandName ? slugifyBrand(brandName) : null;
const parts = [brandSlugForInsert, colorSlug].filter((p): p is string => Boolean(p));
if (parts.length > 0) {
  const lastIndex = handle.lastIndexOf(`-${modelSlug}`);
  if (lastIndex !== -1) {
    handle = handle.slice(0, lastIndex) + `-${parts.join("-")}-${modelSlug}`;
  } else {
    handle = `${handle}-${parts.join("-")}`;
  }
}
```

The `hasRelatedArticles` parameter remains in the signature (unused is fine — leave as-is to avoid call-site changes).
  </action>
  <verify>
    <automated>cd /Users/mnmac/Development/itali-shop-app && npx tsc --noEmit 2>&1 | head -30</automated>
  </verify>
  <done>TypeScript compiles without errors; `buildHandle("krosivky-zhinochi", "EA7 Emporio Armani", "1700", "sinij", false)` would produce `krosivky-zhinochi-ea7-sinij-1700`.</done>
</task>

<task type="auto">
  <name>Task 2: Update buildNewHandle in update-product-handles.ts to insert brand + color before model</name>
  <files>app/service/sync/products/update-product-handles.ts</files>
  <action>
Replace the color-only insertion block in `buildNewHandle` (lines 112-114) with a brand+color insertion block, and update the log message.

Current block to remove:
```ts
if (colorSlug && !handle.includes(colorSlug)) {
  handle = insertColorBeforeModel(handle, colorSlug, slugifyBrand(model));
}
```

Replace with:
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

Also update the log line at approximately line 255:
- Change: `(brand: ${brandSlug} removed)`
- To: `(brand: ${brandSlug} inserted)`

The `insertColorBeforeModel` function can remain in the file — it is now unused but removal is unnecessary.
  </action>
  <verify>
    <automated>cd /Users/mnmac/Development/itali-shop-app && npx tsc --noEmit 2>&1 | head -30</automated>
  </verify>
  <done>TypeScript compiles without errors; log output reads "brand: ea7 inserted" instead of "brand: ea7 removed" when handles are updated.</done>
</task>

</tasks>

<verification>
TypeScript build passes after both tasks:
`cd /Users/mnmac/Development/itali-shop-app && npx tsc --noEmit`

Spot-check logic manually:
- `buildHandle("krosivky-zhinochi", "EA7 Emporio Armani", "1700", "sinij", false)` → `krosivky-zhinochi-ea7-sinij-1700`
- `buildHandle("kedy-zhinochi", "ASH", "movie", "rozhevij", false)` → `kedy-zhinochi-ash-rozhevij-movie`
- `buildHandle("krosivky-zhinochi", "EA7 Emporio Armani", "1700", null, false)` → `krosivky-zhinochi-ea7-1700`
- `buildHandle("krosivky-zhinochi", null, "1700", null, false)` → `krosivky-zhinochi-1700` (no change)
</verification>

<success_criteria>
- `buildHandle` inserts both brand slug and color slug before the model slug
- `buildNewHandle` does the same for the handle bulk-update flow
- TypeScript compiles without errors
- Products with no brand are unaffected
- Log message correctly says "inserted" instead of "removed"
</success_criteria>

<output>
After completion, update `.planning/STATE.md` quick tasks table with entry for task 6.
</output>
