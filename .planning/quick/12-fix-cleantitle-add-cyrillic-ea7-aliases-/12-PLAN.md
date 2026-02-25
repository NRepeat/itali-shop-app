---
phase: quick-12
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - app/service/sync/products/build-product-input.ts
autonomous: true
requirements:
  - QUICK-12-cyrillic-ea7
  - QUICK-12-hestia-alias

must_haves:
  truths:
    - "cleanTitle strips Cyrillic EA7 (ЕА7) from titles for brand EA7 Emporio Armani"
    - "cleanTitle strips Cyrillic EA7 (ЕА7) from titles for brand Emporio Armani"
    - "cleanTitle strips H'estia Venezia (without 'di') from titles for brand H'estia di Venezia"
    - "cleanTitle strips H\u2019estia Venezia (curly apostrophe variant) from titles for brand H'estia di Venezia"
  artifacts:
    - path: "app/service/sync/products/build-product-input.ts"
      provides: "Updated brandAliasMap with Cyrillic EA7 and H'estia variants"
      contains: "\u0415\u04107"
  key_links:
    - from: "brandAliasMap"
      to: "cleanTitle alias loop"
      via: "brandAliasMap[brandName] ?? []"
      pattern: "brandAliasMap\\[brandName\\]"
---

<objective>
Fix two `cleanTitle` bugs by extending `brandAliasMap` in `build-product-input.ts`:

1. Cyrillic EA7: titles contain "ЕА7" (Cyrillic Е=U+0415, А=U+0410) which the `gi` flag does not equate to Latin "EA7". Add Cyrillic strings as explicit aliases.
2. H'estia di Venezia partial name: BC product titles use "H'estia Venezia" (missing "di"), so the exact brand name regex never matches. Add partial-name and apostrophe-variant aliases.

Purpose: Brand names are stripped from product titles during sync. Missed matches leave brand noise in Shopify product titles.
Output: Updated `brandAliasMap` constant — no other files touched.
</objective>

<execution_context>
@/Users/mnmac/.claude/get-shit-done/workflows/execute-plan.md
@/Users/mnmac/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@/Users/mnmac/Development/itali-shop-app/.planning/STATE.md
@/Users/mnmac/Development/itali-shop-app/app/service/sync/products/build-product-input.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Extend brandAliasMap with Cyrillic EA7 and H'estia di Venezia aliases</name>
  <files>app/service/sync/products/build-product-input.ts</files>
  <action>
Replace the current `brandAliasMap` (lines 33-36) with the expanded version below.

Current:
```typescript
const brandAliasMap: Record<string, string[]> = {
  "EA7 Emporio Armani": ["EA7"],
  "Emporio Armani": ["EA7"],
};
```

Replace with:
```typescript
const brandAliasMap: Record<string, string[]> = {
  "EA7 Emporio Armani": ["EA7", "\u0415\u04107", "\u0415\u04107 Emporio Armani"],
  "Emporio Armani": ["EA7", "\u0415\u04107"],
  "H'estia di Venezia": [
    "H'estia Venezia",
    "H\u2019estia Venezia",
    "H\u2019estia di Venezia",
  ],
};
```

Explanation of each addition:
- `"\u0415\u04107"` — Cyrillic Е (U+0415) + Cyrillic А (U+0410) + Latin 7; matches "ЕА7" in titles
- `"\u0415\u04107 Emporio Armani"` — full Cyrillic-prefixed variant for EA7 Emporio Armani brand
- `"H'estia Venezia"` — straight apostrophe, no "di"; matches BC title partial name
- `"H\u2019estia Venezia"` — right single quotation mark (U+2019) variant, no "di"
- `"H\u2019estia di Venezia"` — right single quotation mark (U+2019) variant with "di" (covers curly apostrophe in source data)

No other changes to the file. The existing `cleanTitle` alias loop (lines 56-61) and `buildHandle` alias loop (lines 92-96) will automatically pick up the new entries.
  </action>
  <verify>
    <automated>cd /Users/mnmac/Development/itali-shop-app && npx tsc --noEmit 2>&1 | head -20</automated>
    <manual>Grep for the Cyrillic character to confirm it landed in the file: grep -n "EA7 Emporio" app/service/sync/products/build-product-input.ts</manual>
  </verify>
  <done>
    - `brandAliasMap` has 3 keys: "EA7 Emporio Armani", "Emporio Armani", "H'estia di Venezia"
    - "EA7 Emporio Armani" array has 3 entries including the Cyrillic "ЕА7" string
    - "Emporio Armani" array has 2 entries including the Cyrillic "ЕА7" string
    - "H'estia di Venezia" array has 3 entries covering straight + curly apostrophe variants and omitted "di"
    - `npx tsc --noEmit` exits with no errors
  </done>
</task>

</tasks>

<verification>
TypeScript compiles without errors. Spot-check alias coverage:
- Title "Кросівки ЕА7 Emporio Armani model" with brandName="EA7 Emporio Armani" → both the brand-name regex and the alias "ЕА7 Emporio Armani" alias cover full removal
- Title "Туфлі H'estia Venezia 42" with brandName="H'estia di Venezia" → alias "H'estia Venezia" matches and strips correctly
</verification>

<success_criteria>
- `brandAliasMap` extended with Cyrillic EA7 variants for both EA7 brands
- `brandAliasMap` extended with H'estia Venezia (no "di"), straight and curly apostrophe variants
- TypeScript compilation passes with no new errors
</success_criteria>

<output>
After completion, create `.planning/quick/12-fix-cleantitle-add-cyrillic-ea7-aliases-/12-SUMMARY.md`
</output>
