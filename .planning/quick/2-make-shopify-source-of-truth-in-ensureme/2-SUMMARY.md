---
phase: quick-2
plan: 01
subsystem: database
tags: [shopify, metaobject, prisma, sync, cache]

# Dependency graph
requires:
  - phase: quick-1
    provides: three-step metaobject lookup with Shopify fallback and DB backfill
provides:
  - ensureMetaobject with Shopify-only authoritative first lookup (no local DB pre-check)
affects: [product-sync, metaobject-lookup]

# Tech tracking
tech-stack:
  added: []
  patterns: [Shopify-first lookup — local DB is write-through cache only, never read before Shopify]

key-files:
  created: []
  modified:
    - app/service/sync/products/shopify-product-builder.ts

key-decisions:
  - "Removed prisma.metaobject.findFirst pre-check — stale local DB records can no longer short-circuit the Shopify lookup and return invalid GIDs"
  - "Local DB remains a write-through cache: still upserted after every Shopify hit or creation, never read before Shopify"

patterns-established:
  - "Shopify-first authority: getMetaobjectByHandle is always the first async call in ensureMetaobject"

requirements-completed:
  - QUICK-2

# Metrics
duration: 5min
completed: 2026-02-23
---

# Quick Task 2: Make Shopify Source of Truth in ensureMetaobject Summary

**Removed stale local DB pre-check from ensureMetaobject so Shopify is always queried first, preventing invalid GIDs from deleted metaobjects reaching productSet calls**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-02-23T22:10:00Z
- **Completed:** 2026-02-23T22:16:51Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Removed `prisma.metaobject.findFirst` pre-check that could return stale GIDs for metaobjects deleted from Shopify
- `getMetaobjectByHandle(admin, handle, type)` is now the first async call in `ensureMetaobject`, immediately after the null guard
- Local DB write-through cache preserved: `prisma.metaobject.upsert` still runs after every Shopify hit or creation
- Updated JSDoc to accurately reflect the Shopify-authoritative lookup contract

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove local DB pre-check, make Shopify first lookup** - `78c6f8d` (refactor)

## Files Created/Modified
- `app/service/sync/products/shopify-product-builder.ts` - Removed two-line `findFirst` pre-check from `ensureMetaobject`; updated JSDoc

## Decisions Made
- Removed the DB pre-check entirely rather than keeping it as a secondary fallback — the whole point is that stale DB records must never be trusted as authoritative GIDs. Write-through cache on hit/create is sufficient for performance.

## Deviations from Plan
None - plan executed exactly as written. The change was already partially applied (JSDoc + structure) from quick task 1; this task committed the removal of the two `findFirst` lines that were in the working tree diff.

## Issues Encountered
None. Pre-existing TypeScript errors in `buildProductOptions`, `buildProductVariants`, and `buildMetafields` (implicit `any` types) exist in the file but predate this task and are out of scope.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `ensureMetaobject` now always queries Shopify before returning any GID
- Stale local DB records cannot cause invalid metaobject references in `productSet` calls
- No further changes required for this fix

---
*Phase: quick-2*
*Completed: 2026-02-23*
