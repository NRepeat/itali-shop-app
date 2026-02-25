# Quick Task 8 Summary: Fix duplicate brand in handle when alias already in seo_keyword

## Problem
Handle `sportyvnyj-cholovichyj-kostyum-ea7-3rpv02` (model=3RPV02, brand="EA7 Emporio Armani"):
1. `removeBrandFromHandle(handle, "ea7-emporio-armani")` → no match (full slug not in handle)
2. `ea7` (alias form) remains in handle
3. Model `3rpv02` IS found → brand inserted before it
4. Result: `...kostyum-ea7-ea7-emporio-armani-3rpv02` — duplicate ❌

## Fix
**`build-product-input.ts` `buildHandle`:** After removing full brand slug, also remove
alias slugs using `brandAliasMap`. Strips "ea7" before inserting "ea7-emporio-armani".

**`update-product-handles.ts`:**
- Added `brandAliasSlugs` map (`"EA7 Emporio Armani": ["ea7"]`)
- Added `aliasSlugs: string[] = []` param to `buildNewHandle`
- Alias slugs removed from handle before brand+color insertion
- Call site computes `aliasSlugs` from `brandAliasSlugs[brandName]`

## Result
`sportyvnyj-cholovichyj-kostyum-ea7-3rpv02`
→ remove alias "ea7" → `sportyvnyj-cholovichyj-kostyum-3rpv02`
→ insert brand before model → `sportyvnyj-cholovichyj-kostyum-ea7-emporio-armani-3rpv02` ✓

## Commit
54c20df
