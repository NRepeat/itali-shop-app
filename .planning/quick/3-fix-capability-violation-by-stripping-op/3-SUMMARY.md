---
phase: quick-3
plan: "01"
subsystem: shopify-product-sync
tags: [productSet, capability-violation, retry, metafields]
dependency_graph:
  requires: []
  provides: [CAPABILITY_VIOLATION retry in createProductAsynchronous]
  affects: [app/service/shopify/products/api/create-shopify-product.ts]
tech_stack:
  added: []
  patterns: [detect-all-errors-then-retry, immutable-variables-copy]
key_files:
  created: []
  modified:
    - app/service/shopify/products/api/create-shopify-product.ts
decisions:
  - "Strip-and-retry only when ALL userErrors are CAPABILITY_VIOLATION with a parseable namespace+key — mixed-error responses fall through to null unchanged"
  - "Offending metafields identified via Set keyed on `namespace.key` string to match MetafieldInput fields"
  - "Original variables object is never mutated — spread copy is used for the retry call"
metrics:
  duration: "~5 minutes"
  completed: "2026-02-23"
  tasks_completed: 1
  files_changed: 1
---

# Quick-3: Fix CAPABILITY_VIOLATION by Stripping Option-Linked Metafields Summary

**One-liner:** Auto-retry `productSet` by stripping option-linked metafields that trigger `CAPABILITY_VIOLATION`, so sync succeeds without manual intervention.

## What Changed

### `app/service/shopify/products/api/create-shopify-product.ts`

Added retry logic inside `createProductAsynchronous` in the `userErrors.length > 0` branch, before the existing `return null`.

**Retry pattern:**

1. Check that every error has `code === "CAPABILITY_VIOLATION"` AND its `message` matches `/Metafield Namespace: (\S+),\s*Metafield Key: (\S+)/`.
2. If all errors match, parse each message to extract `{ namespace, key }` pairs and build a `Set<string>` of `"namespace.key"` identifiers.
3. Spread `variables` into a clean copy with `metafields` filtered to exclude any entry whose `namespace.key` is in the offending Set.
4. Log the offending pairs and make a second `client.request` call with the cleaned variables.
5. If the retry returns no `userErrors`, return `retryRes.productSet?.product`.
6. If the retry also has `userErrors`, log them and return null.
7. If the original errors are mixed (not all CAPABILITY_VIOLATION), skip retry and return null as before.

## Decisions Made

- **All-or-nothing gate:** Retry is only triggered when every error is a parseable `CAPABILITY_VIOLATION`. A single non-matching error means we cannot safely strip anything and the existing null-return path is used.
- **Immutable variables:** The retry call uses a spread copy of `variables` so the caller's object is never mutated, which is safer for any future re-use of the variables reference.
- **Single retry:** Only one retry attempt is made. A second violation on the retried call is an unexpected state and is logged then returned as null.

## Deviations from Plan

None — plan executed exactly as written.

## Commits

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Add CAPABILITY_VIOLATION retry to createProductAsynchronous | d68788b |

## Self-Check: PASSED

- `app/service/shopify/products/api/create-shopify-product.ts` — FOUND
- Commit `d68788b` — FOUND
- No TypeScript errors introduced in modified file
