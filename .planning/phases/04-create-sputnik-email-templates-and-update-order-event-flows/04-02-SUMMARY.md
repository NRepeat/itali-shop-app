---
phase: 04-create-sputnik-email-templates-and-update-order-event-flows
plan: "02"
subsystem: ui
tags: [esputnik, email, velocity, ukrainian, transactional]

# Dependency graph
requires: []
provides:
  - "Esputnik Velocity HTML template: 01-zamovlennya-oformleno.html (INITIALIZED event)"
  - "Esputnik Velocity HTML template: 02-pidtverdzheno.html (CONFIRMED event)"
  - "Esputnik Velocity HTML template: 03-vidpravleno.html (IN_PROGRESS event)"
affects:
  - "04-03 (remaining 4 templates use same structural patterns)"
  - "Future phase linking templates to Esputnik workflow events"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Velocity silent references: always $! not bare $data.get() for output; #foreach uses $data.get('items') as collection argument (no ! required)"
    - "Esputnik unsubscribe block placed outside the main 600px wrapper table"
    - "#if guard wrapping optional data fields (trackingNumber, discount, shipping, email, phone)"
    - "Two-column delivery+payment table for order-created; single-column for shipped"

key-files:
  created:
    - ".planning/email/templates/esputnik/01-zamovlennya-oformleno.html"
    - ".planning/email/templates/esputnik/02-pidtverdzheno.html"
    - ".planning/email/templates/esputnik/03-vidpravleno.html"
  modified: []

key-decisions:
  - "Template 02 (confirmed) omits delivery/payment section — keeps email focused on confirmation message only"
  - "Template 03 (shipped) uses single-column delivery (not two-column) since payment info is less relevant after shipment"
  - "Tracking number block in template 03 uses #if($!data.get('trackingNumber')) guard — absent when not available"
  - "3-day reservation notice in template 03 is plain italic text row, not a titled section"

patterns-established:
  - "Velocity foreach: #foreach($item in $data.get('items')) — no ! on collection arg, only on output fields"
  - "All output Velocity variables use $! silent reference to suppress null rendering"
  - "Unsubscribe: always a separate <table> after the closing </table></td></tr></tbody></table> of the main wrapper"
  - "Structure order: header → title → divider → customer info → divider → items header → items loop → divider → totals → divider → template-specific sections → footer → unsubscribe"

requirements-completed: [ORD-01]

# Metrics
duration: 2min
completed: 2026-03-01
---

# Phase 04 Plan 02: Esputnik Email Templates 01-03 Summary

**Three Velocity email templates for order lifecycle (created, confirmed, shipped) with Ukrainian copy, items loop, totals, conditional tracking, and Esputnik unsubscribe block**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-01T12:05:07Z
- **Completed:** 2026-03-01T12:07:46Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Template 01 (замовлення оформлено): full order summary with two-column delivery+payment and manager notice paragraph
- Template 02 (підтверджено): focused confirmation with items and totals, no delivery/payment section
- Template 03 (відправлено): items, totals, conditional tracking number block, single-column delivery, and 3-day reservation italic notice

## Task Commits

Each task was committed atomically:

1. **Task 1: Create directory and template 01 — замовлення оформлено (INITIALIZED)** - `abe4715` (feat)
2. **Task 2: Create template 02 — підтверджено (CONFIRMED) and template 03 — відправлено (IN_PROGRESS)** - `f3330d1` (feat)

**Plan metadata:** _(to be committed)_

## Files Created/Modified
- `.planning/email/templates/esputnik/01-zamovlennya-oformleno.html` - Order created email (INITIALIZED event); h2 "Дякуємо за замовлення!", two-column delivery+payment, manager contact notice
- `.planning/email/templates/esputnik/02-pidtverdzheno.html` - Order confirmed email (CONFIRMED event); h2 "Замовлення підтверджене", items and totals only
- `.planning/email/templates/esputnik/03-vidpravleno.html` - Shipped email (IN_PROGRESS event); h2 "Замовлення відправлено", conditional tracking block, single-column delivery, 3-day reservation notice

## Decisions Made
- Template 02 omits the delivery/payment section — the confirmation message is the focus; delivery was already shown in template 01
- Template 03 uses a single-column delivery section rather than two-column delivery+payment, since payment context is irrelevant after shipment
- The `$data.get('items')` in `#foreach` is correct Velocity syntax and does not need `$!` — the `!` operator is only for output (rendering), not for collection iteration arguments

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. Templates are HTML files ready for upload to Esputnik template library.

## Next Phase Readiness
- Three lifecycle templates (01, 02, 03) complete and ready for upload to Esputnik
- Remaining four templates (04 виконано, 05 готово до самовивозу, 06 немає в наявності, 07 скасовано) handled by plan 04-03
- Upload to Esputnik UI and linking to workflow events is a manual step

---
*Phase: 04-create-sputnik-email-templates-and-update-order-event-flows*
*Completed: 2026-03-01*

## Self-Check: PASSED
- FOUND: .planning/email/templates/esputnik/01-zamovlennya-oformleno.html
- FOUND: .planning/email/templates/esputnik/02-pidtverdzheno.html
- FOUND: .planning/email/templates/esputnik/03-vidpravleno.html
- FOUND: .planning/phases/04-create-sputnik-email-templates-and-update-order-event-flows/04-02-SUMMARY.md
- FOUND commit: abe4715
- FOUND commit: f3330d1
