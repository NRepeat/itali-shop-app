---
phase: quick-12
plan: 01
subsystem: sync
tags: [brand-alias, cleanTitle, cyrillic, title-cleanup, product-sync]

requires: []
provides:
  - "Cyrillic EA7 (ЕА7) stripped from titles for EA7 Emporio Armani and Emporio Armani brands"
  - "H'estia Venezia (no 'di', straight and curly apostrophe) stripped from titles for H'estia di Venezia brand"
affects: [product-sync, title-cleanup, handle-cleanup]

tech-stack:
  added: []
  patterns:
    - "brandAliasMap covers both Latin and Cyrillic script variants of the same brand name"
    - "Straight and curly apostrophe variants enumerated explicitly as separate aliases"

key-files:
  created: []
  modified:
    - app/service/sync/products/build-product-input.ts

key-decisions:
  - "Cyrillic EA7 aliases added as explicit strings rather than regex Unicode ranges — simpler and more maintainable"
  - "H'estia di Venezia aliases cover three variants: partial name (no 'di'), curly apostrophe with 'di', curly apostrophe without 'di'"

patterns-established:
  - "brandAliasMap is the single source of truth for brand name variants; cleanTitle and buildHandle alias loops consume it automatically"

requirements-completed: [QUICK-12-cyrillic-ea7, QUICK-12-hestia-alias]

duration: 5min
completed: 2026-02-25
---

# Quick Task 12: Fix cleanTitle — Add Cyrillic EA7 and H'estia di Venezia Aliases Summary

**Extended brandAliasMap with Cyrillic ЕА7 variants and H'estia Venezia partial-name aliases so cleanTitle strips brand noise from Ukrainian-script product titles.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-02-25T10:22:00Z
- **Completed:** 2026-02-25T10:27:53Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Added Cyrillic ЕА7 (U+0415 U+0410 7) as an alias for both "EA7 Emporio Armani" and "Emporio Armani" brands so `cleanTitle` strips it even though the `gi` flag does not equate Cyrillic letters to Latin ones
- Added the full Cyrillic-prefixed variant "ЕА7 Emporio Armani" as an alias for the "EA7 Emporio Armani" brand
- Added three H'estia di Venezia aliases covering the partial name (no "di"), straight apostrophe, and curly apostrophe (U+2019) variants used in BC product titles

## Task Commits

1. **Task 1: Extend brandAliasMap with Cyrillic EA7 and H'estia di Venezia aliases** - `f69914b` (feat)

## Files Created/Modified

- `app/service/sync/products/build-product-input.ts` - `brandAliasMap` extended from 2 keys/2 entries to 3 keys/8 entries total

## Decisions Made

- Used explicit Unicode escape sequences (`\u0415\u04107`) rather than pasting raw Cyrillic into source to make the intent unambiguous in code review
- Curly apostrophe variant (U+2019) added alongside straight apostrophe because BC data uses both depending on import path

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. Pre-existing TypeScript errors exist in `app/routes/app._index.tsx` and two other route files but are unrelated to this change and were out of scope per deviation rules.

## Next Phase Readiness

- Both `cleanTitle` and `buildHandle` consume `brandAliasMap` automatically; no further changes needed for these brands
- Dashboard "Fix ALL Titles" parallel batch action (quick-11) will apply the new aliases when re-run

---
*Phase: quick-12*
*Completed: 2026-02-25*
