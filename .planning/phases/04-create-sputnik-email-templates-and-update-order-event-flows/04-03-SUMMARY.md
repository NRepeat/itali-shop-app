---
phase: 04-create-sputnik-email-templates-and-update-order-event-flows
plan: "03"
subsystem: ui
tags: [email, esputnik, velocity, html, transactional-email, ukrainian]

# Dependency graph
requires:
  - phase: 04-create-sputnik-email-templates-and-update-order-event-flows
    provides: working-template.html base structure and Esputnik Velocity rules (from plan 04-02 context)
provides:
  - "04-vykonano.html — Order completed email (orderDELIVERED event)"
  - "05-hotovo-do-samovyvozu.html — Ready for pickup email (orderREADY_FOR_PICKUP event) with dynamic pickupAddress"
  - "06-tovaru-nemaie-v-nayavnosti.html — Out of stock email (orderOUT_OF_STOCK event) with recommendation block"
  - "07-skasovano.html — Cancelled email (orderCANCELLED event) with recommendation block"
affects:
  - 04-04-update-order-event-flows

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Esputnik $! silent references: all template variables use $!data.get('field') form"
    - "Velocity #if size() guard: recommendations block gated by $data.get('recommendedItems').size() > 0"
    - "Esputnik unsubscribe block placed OUTSIDE main 600px wrapper table"
    - "Optional fields wrapped with #if($!data.get('field')) guards (discount, shipping, email, phone)"

key-files:
  created:
    - ".planning/email/templates/esputnik/04-vykonano.html"
    - ".planning/email/templates/esputnik/05-hotovo-do-samovyvozu.html"
    - ".planning/email/templates/esputnik/06-tovaru-nemaie-v-nayavnosti.html"
    - ".planning/email/templates/esputnik/07-skasovano.html"
  modified: []

key-decisions:
  - "Template 04 omits delivery/payment section — completed order summary only (no promo code, deferred)"
  - "Template 05 uses $!data.get('pickupAddress') dynamic variable instead of hardcoded store addresses"
  - "Template 06 omits totals section — no purchase was completed for out-of-stock orders"
  - "Template 07 includes totals section — order existed and was cancelled"
  - "Recommendation blocks in 06 and 07 use #if size() > 0 guard to handle empty recommendation engine response"

patterns-established:
  - "Recommendation block pattern: #if($data.get('recommendedItems') && $data.get('recommendedItems').size() > 0) ... #foreach($rec in $data.get('recommendedItems')) ... #end ... #end"
  - "Pickup address block: single-column td with $!data.get('pickupAddress') — no hardcoding"
  - "Reservation notice row: full-width td with italic grey text for 3-day pickup window"

requirements-completed:
  - ORD-01

# Metrics
duration: 3min
completed: 2026-03-01
---

# Phase 04 Plan 03: Esputnik Templates 04-07 Summary

**Four Esputnik Velocity HTML email templates for order completed, pickup ready, out-of-stock, and cancelled events — templates 06 and 07 include #foreach recommendation blocks, template 05 uses dynamic pickupAddress variable**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-01T12:05:32Z
- **Completed:** 2026-03-01T12:08:35Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Template 04 (виконано): order completed confirmation with "Дякуємо за покупку!", customer info, items, and totals
- Template 05 (готово до самовивозу): pickup ready email with dynamic $!data.get('pickupAddress') and 3-day reservation notice
- Templates 06 and 07: out-of-stock and cancelled emails both include the #foreach recommendation block with size() > 0 guard
- Template 06 omits totals (no purchase completed); template 07 includes totals (order existed before cancellation)
- All four templates: $! silent references throughout, unsubscribe block outside main wrapper, zero Shopify Liquid syntax

## Task Commits

Each task was committed atomically:

1. **Task 1: Create templates 04 (виконано) and 05 (готово до самовивозу)** - `6a182d4` (feat)
2. **Task 2: Create templates 06 (товару немає) and 07 (скасовано)** - `d2be721` (feat)

**Plan metadata:** (docs commit to follow)

## Files Created/Modified
- `.planning/email/templates/esputnik/04-vykonano.html` — orderDELIVERED — header, title ("Дякуємо за покупку!"), customer info, items loop, totals, footer + unsubscribe
- `.planning/email/templates/esputnik/05-hotovo-do-samovyvozu.html` — orderREADY_FOR_PICKUP — adds pickup address block ($!data.get('pickupAddress')) and 3-day reservation notice
- `.planning/email/templates/esputnik/06-tovaru-nemaie-v-nayavnosti.html` — orderOUT_OF_STOCK — omits totals, includes #foreach recommendedItems block with size() guard
- `.planning/email/templates/esputnik/07-skasovano.html` — orderCANCELLED — includes totals + #foreach recommendedItems block with size() guard

## Decisions Made
- Template 04 omits the delivery/payment section — for a completed order the customer already knows delivery details; keep template focused on purchase summary
- Template 06 omits totals — no payment was processed for an out-of-stock order
- Template 07 includes totals — the order existed and had a value before cancellation
- Pickup address is fully dynamic via $!data.get('pickupAddress'); store addresses from CONTEXT.md are NOT hardcoded in the template

## Deviations from Plan
None — plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None — no external service configuration required. Templates are HTML files ready for upload to Esputnik's template library.

## Next Phase Readiness
- All 4 templates (04-07) complete, along with templates 01-03 from plan 04-02 (to be executed)
- Templates ready for upload to Esputnik UI and linking in order event workflows
- Plan 04-04 (update order event flows) is the final plan in this phase

---
*Phase: 04-create-sputnik-email-templates-and-update-order-event-flows*
*Completed: 2026-03-01*
