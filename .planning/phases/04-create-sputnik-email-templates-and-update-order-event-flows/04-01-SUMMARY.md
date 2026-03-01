---
phase: 04-create-sputnik-email-templates-and-update-order-event-flows
plan: "01"
subsystem: api
tags: [esputnik, bullmq, keycrm, typescript, order-events]

# Dependency graph
requires: []
provides:
  - "EsputnikOrderStatus union with 7 values: INITIALIZED, CONFIRMED, IN_PROGRESS, DELIVERED, READY_FOR_PICKUP, OUT_OF_STOCK, CANCELLED"
  - "EsputnikOrderJobData with optional pickupAddress field"
  - "EsputnikOrder interface with optional pickupAddress and trackingNumber fields"
  - "mapShopifyOrderToEsputnik with optional extra param for field pass-through"
  - "keyCRM status 3 maps to CONFIRMED (not INITIALIZED)"
  - "keyCRM status 15 maps to OUT_OF_STOCK (not CANCELLED)"
affects:
  - 04-create-sputnik-email-templates-and-update-order-event-flows

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Status enum extension: new keyCRM events get distinct EsputnikOrderStatus strings to avoid double-send"
    - "Optional extra param pattern: mapShopifyOrderToEsputnik accepts { pickupAddress, trackingNumber } spread into return object"

key-files:
  created: []
  modified:
    - app/shared/lib/queue/esputnik-order.queue.ts
    - app/shared/config/keycrm.ts
    - app/service/esputnik/esputnik-order.service.ts
    - app/service/esputnik/esputnik-order.worker.ts

key-decisions:
  - "keyCRM status 3 maps to CONFIRMED (not INITIALIZED) to prevent double-sending the order-created email that orders/create already fires as INITIALIZED"
  - "keyCRM status 15 maps to OUT_OF_STOCK (not CANCELLED) so the out-of-stock case can have its own distinct email template"
  - "READY_FOR_PICKUP status ID deferred (commented) until keyCRM admin panel lookup confirms the numeric ID"
  - "EsputnikOrderStatus imported into keycrm.ts for strict Record type annotation replacing inline string union"

patterns-established:
  - "Extra field pass-through: worker destructures optional fields from job.data and passes as extra param to service mapper"

requirements-completed: [ORD-01]

# Metrics
duration: 1min
completed: 2026-03-01
---

# Phase 04 Plan 01: Extend Esputnik Type System Summary

**Extended EsputnikOrderStatus to 7 values and fixed two critical keyCRM status mismatches (status 3 INITIALIZED→CONFIRMED, status 15 CANCELLED→OUT_OF_STOCK) to support all order lifecycle email events**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-01T12:05:07Z
- **Completed:** 2026-03-01T12:06:31Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Added CONFIRMED, READY_FOR_PICKUP, OUT_OF_STOCK to EsputnikOrderStatus union (now 7 values)
- Fixed keyCRM status 3: was INITIALIZED (would double-fire with orders/create webhook), now CONFIRMED
- Fixed keyCRM status 15: was CANCELLED (no distinct email), now OUT_OF_STOCK
- Extended EsputnikOrder interface with optional pickupAddress and trackingNumber fields
- Extended mapShopifyOrderToEsputnik with optional extra param and spread into return object
- Updated worker to pass pickupAddress from job.data to service mapper

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend EsputnikOrderStatus union and EsputnikOrderJobData** - `3690586` (feat)
2. **Task 2: Fix keyCRM status map and extend EsputnikOrder interface** - `b1ca1c7` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified
- `app/shared/lib/queue/esputnik-order.queue.ts` - EsputnikOrderStatus union (7 values), EsputnikOrderJobData with optional pickupAddress
- `app/shared/config/keycrm.ts` - Fixed esputnikStatusMap (status 3→CONFIRMED, 15→OUT_OF_STOCK), imported EsputnikOrderStatus type
- `app/service/esputnik/esputnik-order.service.ts` - EsputnikOrder interface with pickupAddress/trackingNumber, mapShopifyOrderToEsputnik extra param
- `app/service/esputnik/esputnik-order.worker.ts` - Destructures pickupAddress from job.data, passes to mapper

## Decisions Made
- **CONFIRMED vs INITIALIZED for keyCRM status 3:** The orders/create webhook fires INITIALIZED when an order is placed. keyCRM status 3 is "Підтверджено" (confirmed by staff). Using CONFIRMED avoids double-sending the order-created email, allowing Esputnik to route to a distinct confirmation template.
- **OUT_OF_STOCK for keyCRM status 15:** "Немає в наявності" is a distinct customer-facing situation from CANCELLED and deserves its own email template, so it gets its own status string.
- **READY_FOR_PICKUP placeholder:** The keyCRM numeric ID for the ready-for-pickup status was not confirmed at plan time; a comment is left in the map for addition after checking the keyCRM admin panel.
- **Type import in keycrm.ts:** Using `import type { EsputnikOrderStatus }` for the Record annotation instead of an inline string union ensures the type annotation stays in sync as the union grows.

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
Pre-existing TypeScript errors in `app/routes/app._index.tsx` and `app/routes/api.*.ts` files were present before this plan and are unrelated to the esputnik/keycrm type changes. All modified files compile cleanly.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Type contracts are in place for all 7 order lifecycle events
- Downstream plans (04-04) can now import and use CONFIRMED, READY_FOR_PICKUP, OUT_OF_STOCK from EsputnikOrderStatus
- READY_FOR_PICKUP keyCRM status ID still needs to be looked up in keyCRM admin panel before that event can be wired

---
*Phase: 04-create-sputnik-email-templates-and-update-order-event-flows*
*Completed: 2026-03-01*

## Self-Check: PASSED

- FOUND: app/shared/lib/queue/esputnik-order.queue.ts
- FOUND: app/shared/config/keycrm.ts
- FOUND: app/service/esputnik/esputnik-order.service.ts
- FOUND: app/service/esputnik/esputnik-order.worker.ts
- FOUND: .planning/phases/04-.../04-01-SUMMARY.md
- FOUND commit: 3690586
- FOUND commit: b1ca1c7
