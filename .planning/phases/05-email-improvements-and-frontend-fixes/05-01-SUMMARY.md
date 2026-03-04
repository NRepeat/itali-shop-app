---
phase: 05-email-improvements-and-frontend-fixes
plan: 01
subsystem: email
tags: [esputnik, velocity, email-templates, html]

# Dependency graph
requires:
  - phase: 04-create-sputnik-email-templates-and-update-order-event-flows
    provides: initial eSputnik email templates 01-04 in .planning/email/templates/esputnik/
provides:
  - Updated email templates 01-04 with corrected colors, prices, dates, logo links, and no delivery cost row
  - Template 01 with manager notice repositioned under h2 heading
  - Template 01 with order date including time (HH:mm)
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Velocity intValue() pattern: #set($varInt = $data.get('field').intValue()) then $varInt грн — strips kopecks and replaces UAH currency reference"
    - "Logo anchor wrap: <a href='https://miomio.com.ua' target='_blank' style='display:block;line-height:0'> around <img> in blue header TD"

key-files:
  created: []
  modified:
    - .planning/email/templates/esputnik/01-zamovlennya-oformleno.html
    - .planning/email/templates/esputnik/02-pidtverdzheno.html
    - .planning/email/templates/esputnik/03-vidpravleno.html
    - .planning/email/templates/esputnik/04-vykonano.html

key-decisions:
  - "intValue() called directly on the Velocity data object value — set to a new variable first to avoid inline method call rendering issues"
  - "totalCost used twice in template 01 (Totals + Payment column) — separate #set variables ($totalCostInt and $totalCostInt2) to avoid scoping issues"
  - "Template 03 tracking block #if guard left entirely unchanged — plan explicitly said to preserve it"
  - "Template 04 delivery/payment section was already absent per phase 04 design decision — confirmed absent, nothing to remove"

patterns-established:
  - "Price format: always use #set + intValue() before the output line; never inline .intValue() in $! expression"

requirements-completed: [ORD-01]

# Metrics
duration: 5min
completed: 2026-03-04
---

# Phase 05 Plan 01: Email Visual Fixes Summary

**Visual and formatting corrections applied to all four eSputnik order email templates: near-black text (#1a1a1a), integer hryvnia prices, date+time, clickable logo, and no delivery cost row**

## Performance

- **Duration:** ~5 min (auto tasks 1-2)
- **Started:** 2026-03-04T13:24:22Z
- **Completed:** 2026-03-04T13:29:00Z (Tasks 1-2; Task 3 awaiting human action)
- **Tasks:** 2/3 complete (Task 3 is a human-action checkpoint)
- **Files modified:** 4

## Accomplishments
- Applied all common visual fixes to templates 01-04: logo anchor, color changes, integer prices with грн, delivery cost row removal
- Template 01: moved "Наші менеджери..." manager notice paragraph to directly below h2 heading (was at bottom before footer)
- Template 01: order date now includes time (`dd.MM.yyyy HH:mm`)
- Template 03: tracking number `#if` guard preserved intact; Трекінг h3 color changed to `#1a1a1a`
- Template 04: confirmed delivery/payment section already absent per prior design; no changes needed beyond common fixes

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix templates 01 and 02** - `12a2af2` (feat)
2. **Task 2: Fix templates 03 and 04** - `2a5d113` (feat)
3. **Task 3: Update eSputnik sender display name** - PENDING (human-action checkpoint)

## Files Created/Modified
- `.planning/email/templates/esputnik/01-zamovlennya-oformleno.html` - Clickable logo, #1a1a1a text, intValue prices, HH:mm date, manager notice at top, no delivery cost row
- `.planning/email/templates/esputnik/02-pidtverdzheno.html` - Clickable logo, #1a1a1a text, intValue prices, no delivery cost row
- `.planning/email/templates/esputnik/03-vidpravleno.html` - Clickable logo, #1a1a1a text, intValue prices, no delivery cost row, tracking guard preserved
- `.planning/email/templates/esputnik/04-vykonano.html` - Clickable logo, #1a1a1a text, intValue prices, no delivery cost row

## Decisions Made
- `intValue()` is set to a named variable via `#set` before use rather than inlined in expression, following Velocity best practices
- Template 01 uses two separate `#set` variables for `totalCost` because it appears in both the Totals section and the Payment column
- Template 04 delivery/payment section was already absent per phase 04 design — confirmed and left as-is

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

**Task 3 requires manual action in eSputnik admin.**

1. Log in to eSputnik account at https://esputnik.com
2. Go to Account Settings → Sender Names (Імена відправників)
3. Find the sender used by transactional email workflows for order emails
4. Change the display name (From name) to: **Міо Міо**
5. Save the change
6. If sender name is set per-workflow, update each transactional workflow (INITIALIZED, CONFIRMED, IN_PROGRESS, DELIVERED, CANCELLED)
7. Verify: send a test email and confirm the "From:" field shows "Міо Міо"

## Next Phase Readiness
- All 4 HTML templates are ready to paste into eSputnik editor
- eSputnik sender display name update is the only remaining action for this plan
- After Task 3 is complete, this plan is fully done

---
*Phase: 05-email-improvements-and-frontend-fixes*
*Completed: 2026-03-04 (Tasks 1-2; Task 3 pending human action)*
