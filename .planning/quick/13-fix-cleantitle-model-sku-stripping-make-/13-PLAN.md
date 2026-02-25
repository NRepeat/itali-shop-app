---
phase: quick-13
plan: 13
type: execute
wave: 1
depends_on: []
files_modified:
  - app/service/sync/products/build-product-input.ts
  - app/service/sync/products/update-product-titles.ts
autonomous: true
requirements: [QUICK-13]

must_haves:
  truths:
    - "cleanTitle strips model regardless of case (e.g. '3DPF78' stripped when model is '3dpf78')"
    - "updateProductTitles also strips bc_product.sku from title when sku differs from model and contains digits"
    - "Titles like 'Футболка-поло чоловіча 3DPF78' become 'Футболка-поло чоловіча' after fix-titles runs"
  artifacts:
    - path: "app/service/sync/products/build-product-input.ts"
      provides: "cleanTitle with case-insensitive model regex"
      contains: "\"gi\""
    - path: "app/service/sync/products/update-product-titles.ts"
      provides: "sku field selected and stripped in updateProductTitles"
      contains: "product.sku"
  key_links:
    - from: "update-product-titles.ts"
      to: "build-product-input.ts cleanTitle"
      via: "second cleanTitle call with sku"
      pattern: "cleanTitle\\(newTitle.*product\\.sku\\)"
---

<objective>
Fix two gaps that leave article numbers (e.g. "3DPF78") in product titles after fix-titles runs.

Purpose: bc_product.model is stored lowercase; the title contains the uppercase form. The existing regex is case-sensitive so no match occurs. Additionally, some products store the visible article in bc_product.sku instead of (or in addition to) model, so a second strip pass using sku is needed.
Output: Two modified source files; titles like "Футболка-поло чоловіча 3DPF78" → "Футболка-поло чоловіча" on next fix-titles run.
</objective>

<execution_context>
@/Users/mnmac/.claude/get-shit-done/workflows/execute-plan.md
@/Users/mnmac/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@/Users/mnmac/Development/itali-shop-app/.planning/STATE.md
@/Users/mnmac/Development/itali-shop-app/app/service/sync/products/build-product-input.ts
@/Users/mnmac/Development/itali-shop-app/app/service/sync/products/update-product-titles.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Make cleanTitle model-strip regex case-insensitive</name>
  <files>app/service/sync/products/build-product-input.ts</files>
  <action>
In `cleanTitle` (line 70), change the regex flag from `"g"` to `"gi"`:

BEFORE (line 70):
```typescript
t = t.replace(new RegExp(`(^|\\s)${escapedModel}(?=\\s|$)`, "g"), " ");
```

AFTER:
```typescript
t = t.replace(new RegExp(`(^|\\s)${escapedModel}(?=\\s|$)`, "gi"), " ");
```

Only this one character changes. No other modifications to this file.
  </action>
  <verify>
    <automated>cd /Users/mnmac/Development/itali-shop-app && npx tsc --noEmit 2>&1 | head -20</automated>
    <manual>Grep confirms the change: grep -n '"gi"' app/service/sync/products/build-product-input.ts</manual>
  </verify>
  <done>"gi" flag present in the model-strip regex; TypeScript compiles without errors.</done>
</task>

<task type="auto">
  <name>Task 2: Fetch and strip bc_product.sku in updateProductTitles</name>
  <files>app/service/sync/products/update-product-titles.ts</files>
  <action>
Two changes in `updateProductTitles`:

**Change 1 — add `sku` to the select block (lines 49-53):**

BEFORE:
```typescript
    select: {
      product_id: true,
      model: true,
      manufacturer_id: true,
    },
```

AFTER:
```typescript
    select: {
      product_id: true,
      model: true,
      sku: true,
      manufacturer_id: true,
    },
```

**Change 2 — strip sku after the existing cleanTitle call (currently line 80):**

BEFORE:
```typescript
      const newTitle = cleanTitle(description.name, vendor?.name, product.model);
```

AFTER:
```typescript
      let newTitle = cleanTitle(description.name, vendor?.name, product.model);
      if (product.sku && product.sku !== product.model && /\d/.test(product.sku)) {
        newTitle = cleanTitle(newTitle, null, product.sku);
      }
```

Note: `cleanTitle` accepts `null` as the second argument (brandName) — the function already guards with `if (brandName)`, so passing null safely skips brand stripping and only strips the sku token. The `"gi"` fix from Task 1 applies to this call as well.
  </action>
  <verify>
    <automated>cd /Users/mnmac/Development/itali-shop-app && npx tsc --noEmit 2>&1 | head -20</automated>
    <manual>Confirm both changes: grep -n 'sku' app/service/sync/products/update-product-titles.ts</manual>
  </verify>
  <done>
- `sku: true` present in the findMany select block.
- Second cleanTitle call present guarded by `product.sku && product.sku !== product.model && /\d/.test(product.sku)`.
- TypeScript compiles without errors.
  </done>
</task>

</tasks>

<verification>
After both tasks:
1. `npx tsc --noEmit` exits 0.
2. `grep -n '"gi"' app/service/sync/products/build-product-input.ts` returns line 70.
3. `grep -n 'sku' app/service/sync/products/update-product-titles.ts` returns at least 3 lines (select field + guard condition + cleanTitle call).
</verification>

<success_criteria>
- cleanTitle("Футболка-поло чоловіча 3DPF78", null, "3dpf78") returns "Футболка-поло чоловіча" (case-insensitive match).
- updateProductTitles strips sku token in a second pass when sku differs from model and contains digits.
- No TypeScript compilation errors.
</success_criteria>

<output>
After completion, create `.planning/quick/13-fix-cleantitle-model-sku-stripping-make-/13-SUMMARY.md`
</output>
