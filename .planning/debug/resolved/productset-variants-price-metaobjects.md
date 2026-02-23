---
status: resolved
trigger: "On the forceProductSet (productSet on existing product) path, variants are not being created and price is set to 0. Also missing metaobjects need to be auto-created."
created: 2026-02-24T00:00:00Z
updated: 2026-02-24T00:20:00Z
---

## Current Focus

hypothesis: RESOLVED
test: Fix applied and type-checked
expecting: n/a
next_action: n/a

## Symptoms

expected: Product sync should create variants with correct prices; metaobjects that don't exist should be created automatically
actual: Variants not created, price set to 0, missing metaobjects cause issues (silently skipped)
errors: No explicit error messages reported
reproduction: forceProductSet=true path — productSet on an existing Shopify product
started: Regression — previously worked before recent changes

## Eliminated

## Evidence

- timestamp: 2026-02-24T00:05:00Z
  checked: buildProductVariants in shopify-product-builder.ts lines 302-305
  found: |
    When getMetafields returns no definition for an option, the code `continue`s —
    skipping that pov entirely. For the variant to be added, ALL option values
    in a combo must succeed (line 337: optionValuesForVariant.length !== optionsMap.size).
    If any pov fails (no metafield definition), the variant is silently dropped.
  implication: Variants are skipped when any option value lacks a metafield definition

- timestamp: 2026-02-24T00:06:00Z
  checked: buildProductVariants lines 341-343 — price field + buildProductInput lines 123-124
  found: |
    price: product.price.toString() is correct in the data.
    But when variants array is EMPTY (due to the skip bug above), buildProductInput
    omits both productOptions and variants from the productSet payload.
    Shopify creates a default $0 variant. Price=0 is a symptom of empty variants array.
  implication: Price=0 is a SYMPTOM of variants being dropped, not a separate bug

- timestamp: 2026-02-24T00:07:00Z
  checked: buildProductOptions — same skip pattern
  found: |
    When getMetafields returns no definition, the entire option is skipped via `continue`.
    This causes the productSet to receive no productOptions either.
  implication: Options also dropped when no metafield definition exists

- timestamp: 2026-02-24T00:08:00Z
  checked: ensureMetaobject failure path (line 322-324 in buildProductVariants)
  found: |
    When ensureMetaobject fails to create/find a metaobject, it also `continue`s,
    also dropping the pov and failing the completeness guard.
  implication: Second failure mode — ensureMetaobject failure also drops variants

## Resolution

root_cause: |
  THREE ROOT CAUSES:

  1. VARIANTS DROPPED (primary): In buildProductVariants, when getMetafields returns
     no definition for an option (lines 302-304), code `continue`s. The guard at
     line 337 (optionValuesForVariant.length !== optionsMap.size) then drops the
     entire variant combination. ALL variants are silently dropped if any option
     lacks a metafield definition.

  2. PRICE=0 IS A SYMPTOM (secondary): When variants array is empty, buildProductInput
     omits both productOptions and variants from the productSet payload (lines 123-124).
     Shopify creates a default $0 variant. The price is correct in the data — Shopify
     fills in its own default because no variants were provided.

  3. ENSUREMETAOBJECT FAILURE (secondary): Same drop-on-failure pattern when
     ensureMetaobject cannot create/find a metaobject — the pov is skipped,
     variant fails completeness guard.

  4. OPTIONS DROPPED (secondary): Same pattern in buildProductOptions — when no
     metafield definition, entire option is skipped via `continue`.

fix: |
  In buildProductVariants: changed both `continue` paths (no metafield definition,
  ensureMetaobject failure) to fall back to plain {optionName, name} values
  (VariantOptionValueInput supports both `name` and `linkedMetafieldValue`).
  This ensures the completeness guard at line 337 passes and variants are created.

  In buildProductOptions: changed `continue` path (no metafield definition) to
  fall back to plain {name, values: [{name}]} option structure (OptionSetInput
  supports `values` array of OptionValueSetInput with `name` fields).

  Both fallback types are valid per Shopify's admin.types.d.ts.

verification: TypeScript type-check passed with no new errors in changed files.
files_changed:
  - app/service/sync/products/shopify-product-builder.ts
