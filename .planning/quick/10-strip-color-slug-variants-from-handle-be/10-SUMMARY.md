# Quick Task 10: Strip color slug variants from handle before canonical color insertion

## Problem
`seo_keyword` = `...kostyum-synij-8npv08` (Russian variant "synij" for "Синій")
After brand/alias removal, `synij` stays in handle.
Canonical colorSlug `sinij` inserted → result has both: `...kostyum-synij-ea7-...-sinij-8npv08` ❌

## Fix
In `buildNewHandle` (update-product-handles.ts): when `colorSlug` is present,
strip all `colorMapping` values + known variants (`synij`, `bilyi`, `chornyi`)
from handle before insertion.

## Result
`...kostyum-synij-8npv08` → strip `synij` → `...kostyum-8npv08` → insert `ea7-emporio-armani-sinij` → `...kostyum-ea7-emporio-armani-sinij-8npv08` ✓

## Commit: a4b15f4
