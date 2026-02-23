---
phase: quick-1
plan: 1
subsystem: product-sync
tags: [metaobjects, shopify-api, sync, deduplication]
dependency_graph:
  requires: []
  provides: [metaobject-three-step-lookup]
  affects: [ensureMetaobject, buildProductOptions, buildProductVariants, buildMetafields]
tech_stack:
  added: []
  patterns: [shopify-graphql-metaobjectByHandle, prisma-upsert-backfill]
key_files:
  created:
    - app/service/shopify/metaobjects/getMetaobjectByHandle.ts
  modified:
    - app/service/sync/products/shopify-product-builder.ts
decisions:
  - "Three-step lookup: local DB -> Shopify -> create. Prevents duplicate-create when Shopify has the metaobject but local DB does not."
  - "Use prisma.metaobject.upsert (not create) for backfill to avoid race conditions on handle uniqueness constraint."
metrics:
  duration: 72s
  completed: 2026-02-23
---

# Quick Task 1: Metaobject Upsert Shopify Fallback Lookup Summary

**One-liner:** Three-step metaobject lookup (local DB -> Shopify -> create) with DB backfill prevents duplicate-create errors after crashed sync runs.

## What Was Built

`ensureMetaobject` previously had two steps: check local DB, then create in Shopify. When a sync crashed after creating a metaobject in Shopify but before persisting it locally, the next sync attempt would call `metaobjectCreate` on a handle that already exists, getting a `DUPLICATE_VALUE` error and returning `null`. This caused option/metafield values to be silently dropped.

The fix inserts a new Step 2 between the DB check and the create call: query Shopify's `metaobjectByHandle` endpoint. On hit, the local DB is backfilled via `prisma.metaobject.upsert` and the existing GID is returned. The create call (Step 3) only fires when both lookups miss.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Add getMetaobjectByHandle Shopify query | 0803bf2 | app/service/shopify/metaobjects/getMetaobjectByHandle.ts (created) |
| 2 | Update ensureMetaobject with three-step lookup | c711e09 | app/service/sync/products/shopify-product-builder.ts (modified) |

## Implementation Details

### getMetaobjectByHandle.ts

New utility at `app/service/shopify/metaobjects/getMetaobjectByHandle.ts`:
- Uses `metaobjectByHandle(handle: MetaobjectHandleInput!)` GraphQL query
- Takes `admin`, `handle`, and `type`; passes `{ handle, type }` as the `handle` variable (Shopify's `MetaobjectHandleInput`)
- Returns `{ id, handle, type }` or `null` on miss or error
- Wraps in try/catch, logs errors via `console.error`

### ensureMetaobject three-step logic

```
Step 1: prisma.metaobject.findFirst({ where: { handle, type } })
        → return existing.metaobjectId on hit

Step 2: getMetaobjectByHandle(admin, handle, type)          [NEW]
        → on hit: prisma.metaobject.upsert (backfill)
        → log "[ensureMetaobject] Backfilled from Shopify ..."
        → return fromShopify.id

Step 3: createMetaobject(...) + prisma.metaobject.upsert
        → only runs when both DB and Shopify miss
```

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check

- [x] `app/service/shopify/metaobjects/getMetaobjectByHandle.ts` exists and exports `getMetaobjectByHandle`
- [x] `ensureMetaobject` contains all three steps in the correct order
- [x] Backfill log message wired: `[ensureMetaobject] Backfilled from Shopify ...`
- [x] No net-new TypeScript errors introduced (pre-existing `res.data` pattern shared across all metaobject files)
- [x] Both task commits exist: 0803bf2, c711e09
