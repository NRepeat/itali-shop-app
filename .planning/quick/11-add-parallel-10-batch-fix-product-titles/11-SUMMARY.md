---
phase: quick-11
plan: 11
subsystem: dashboard / product-titles
tags: [parallel, titles, dashboard, performance]
dependency_graph:
  requires: [update-product-titles.ts]
  provides: [updateProductTitlesParallel, fix-titles-parallel action]
  affects: [app._index.tsx, update-product-titles.ts]
tech_stack:
  added: []
  patterns: [Promise.all parallel batching, matching updateProductHandlesParallel pattern]
key_files:
  created: []
  modified:
    - app/service/sync/products/update-product-titles.ts
    - app/routes/app._index.tsx
decisions:
  - "Mirror updateProductHandlesParallel exactly — same signature (batchCount=10), same batch/offset math, same log aggregation pattern"
metrics:
  duration: 54s
  completed: 2026-02-25
  tasks_completed: 2
  files_modified: 2
---

# Phase quick-11 Plan 11: Add Parallel 10-Batch Fix Product Titles Summary

**One-liner:** 10-batch parallel title fixer using Promise.all, matching the proven handles parallel pattern, with dashboard button wired to fix-titles-parallel action.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add updateProductTitlesParallel to update-product-titles.ts | 451dd08 | app/service/sync/products/update-product-titles.ts |
| 2 | Wire action branch and dashboard button in app._index.tsx | eeb72fe | app/routes/app._index.tsx |

## What Was Built

`updateProductTitlesParallel` exported from `update-product-titles.ts`:
- Counts all active products via `externalDB.bc_product.count({ where: { status: true } })`
- Splits into `batchCount` (default 10) equal batches using offset/limit
- Runs all batches concurrently via `Promise.all`
- Aggregates logs with per-batch headers and a total summary

Dashboard changes in `app._index.tsx`:
- Updated import: `{ updateProductTitles, updateProductTitlesParallel }`
- New `else if (body.action === "fix-titles-parallel")` branch that calls `updateProductTitlesParallel`
- New "Fix ALL Titles (10 parallel)" button with `variant="primary" tone="critical"` in the Fix Product Titles section, showing "Fixing (10 workers)..." while loading

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- `grep -n "fix-titles-parallel" app/routes/app._index.tsx` shows 3 hits (lines 124, 689, 692)
- `grep -n "updateProductTitlesParallel" app/service/sync/products/update-product-titles.ts` shows export at line 153
- Pre-existing TypeScript errors in other routes are out-of-scope; no new errors introduced by these changes

## Self-Check: PASSED

Files exist:
- app/service/sync/products/update-product-titles.ts — FOUND (updateProductTitlesParallel at line 153)
- app/routes/app._index.tsx — FOUND (fix-titles-parallel at lines 124, 689, 692)

Commits exist:
- 451dd08 — feat(quick-11): add updateProductTitlesParallel
- eeb72fe — feat(quick-11): wire fix-titles-parallel action branch and dashboard button
