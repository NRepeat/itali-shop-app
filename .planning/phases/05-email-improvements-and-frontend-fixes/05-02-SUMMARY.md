---
phase: 05-email-improvements-and-frontend-fixes
plan: 02
subsystem: ui
tags: [email, esputnik, velocity, html-templates]

# Dependency graph
requires: []
provides:
  - "Template 05 (Готово до самовивозу) — READY_FOR_PICKUP email with logo link, black text, integer hryvnia prices, no delivery row, pickupAddress preserved"
  - "Template 06 (Товар недоступний) — OUT_OF_STOCK email with logo link, black text, integer hryvnia prices, recommendation block intact"
  - "Template 07 (Скасовано) — CANCELLED email with logo link, black text, integer hryvnia prices, no delivery row, recommendation block intact"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "intValue() pattern for integer hryvnia prices: #set($varInt = $!data.get('key').intValue()) followed by $varInt грн"
    - "Logo anchor wrapping: <a href='https://miomio.com.ua' target='_blank' style='display:block;line-height:0'> around logo img"
    - "Double #if guard for recommendation blocks: #if($data.get('recommendedItems')) #if($data.get('recommendedItems').size() gt 0)"

key-files:
  created: []
  modified:
    - ".planning/email/templates/esputnik/05-hotovo-do-samovyvozu.html"
    - ".planning/email/templates/esputnik/06-tovaru-nemaie-v-nayavnosti.html"
    - ".planning/email/templates/esputnik/07-skasovano.html"

key-decisions:
  - "Recommendation block color preserved as #05125C inside the #if guard blocks in templates 06/07 — only body/heading text outside blocks gets #1a1a1a treatment"

patterns-established:
  - "intValue() price format: same pattern as plan 01 applied consistently across all templates"

requirements-completed: [ORD-01]

# Metrics
duration: 8min
completed: 2026-03-04
---

# Phase 05 Plan 02: Email Templates 05-07 Visual Fixes Summary

**Logo anchor, #1a1a1a body text, intValue() hryvnia prices, and removed delivery rows applied to templates 05 (pickup), 06 (out-of-stock), and 07 (cancelled) — recommendation blocks in 06/07 preserved exactly**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-03-04T09:00:00Z
- **Completed:** 2026-03-04T09:08:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Template 05 (Готово до самовивозу): clickable logo, black text on h2/h3/name/items/totals/pickup heading, integer hryvnia prices for item cost + discount + totalCost, delivery cost row removed, pickupAddress variable preserved
- Template 06 (Товар недоступний): clickable logo, black text on h2/h3/name/items, integer hryvnia prices for item cost, recommendation block with double #if guard preserved untouched
- Template 07 (Скасовано): clickable logo, black text on h2/h3/name/items/totals, integer hryvnia prices for item cost + discount + totalCost, delivery cost row removed, recommendation block with double #if guard preserved untouched

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix template 05 (Готово до самовивозу)** - `50f5ef0` (feat)
2. **Task 2: Fix templates 06 and 07 (Товар недоступний, Скасовано)** - `636ae92` (feat)

**Plan metadata:** _(docs commit below)_

## Files Created/Modified
- `.planning/email/templates/esputnik/05-hotovo-do-samovyvozu.html` - READY_FOR_PICKUP template with all visual fixes
- `.planning/email/templates/esputnik/06-tovaru-nemaie-v-nayavnosti.html` - OUT_OF_STOCK template with visual fixes; recommendation block intact
- `.planning/email/templates/esputnik/07-skasovano.html` - CANCELLED template with visual fixes and totals; recommendation block intact

## Decisions Made
- Recommendation block interior (h3 "Можливо вас зацікавить" and rec item anchor links) left at `#05125C` — the plan instruction was to not touch the recommendation blocks at all, so color changes were applied only to elements outside those guards.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Templates 05, 06, and 07 are ready to paste into eSputnik editor
- All three templates share the same fix set as templates 01-04 (plan 01, pending execution)
- Plans 03 onward can proceed independently

---
*Phase: 05-email-improvements-and-frontend-fixes*
*Completed: 2026-03-04*
