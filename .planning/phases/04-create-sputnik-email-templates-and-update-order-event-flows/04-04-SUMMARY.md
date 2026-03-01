---
phase: 04-create-sputnik-email-templates-and-update-order-event-flows
plan: "04"
subsystem: api
tags: [esputnik, bullmq, keycrm, webhooks, order-events]

# Dependency graph
requires:
  - phase: 04-create-sputnik-email-templates-and-update-order-event-flows/04-01
    provides: EsputnikOrderStatus union type, esputnikOrderQueue with pickupAddress field, esputnikStatusMap with full 6-status mapping

provides:
  - orders/create Shopify webhook wired to esputnikOrderQueue with status INITIALIZED
  - PICKUP_ADDRESS_MAP static map constant with DEPLOYMENT BLOCKER comment for READY_FOR_PICKUP events
  - pickupAddress passthrough in handleKeyCrmOrderStatusChange for READY_FOR_PICKUP status
  - Full Esputnik event trigger coverage for all 7 order lifecycle events

affects:
  - esputnik-order worker (consumes queue jobs from both new trigger paths)
  - deployment checklist (PICKUP_ADDRESS_MAP must be populated before go-live)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Static address map pattern: PICKUP_ADDRESS_MAP keyed by keyCRM status ID for per-store pickup addresses"
    - "Conditional spread pattern: ...(pickupAddress && { pickupAddress }) to include optional field only when truthy"
    - "DEPLOYMENT BLOCKER comment convention: documents intentionally empty maps with action steps and known values"

key-files:
  created: []
  modified:
    - app/routes/webhooks.orders.create.tsx
    - app/service/keycrm/keycrm-shopify-sync.service.ts

key-decisions:
  - "INITIALIZED fires on orders/create (not keyCRM): orders/create directly enqueues INITIALIZED, while keyCRM status 3 maps to CONFIRMED, preventing double order-created email"
  - "PICKUP_ADDRESS_MAP intentionally empty at deploy: keyCRM status IDs for READY_FOR_PICKUP stores are unknown until confirmed in admin panel; DEPLOYMENT BLOCKER comment documents all 4 store addresses to map"
  - "Conditional spread for pickupAddress: only included in queue job when truthy, not when undefined from empty map lookup"

patterns-established:
  - "DEPLOYMENT BLOCKER comment: use for intentionally incomplete configs requiring human action before go-live"

requirements-completed:
  - ORD-01

# Metrics
duration: 3min
completed: 2026-03-01
---

# Phase 04 Plan 04: Wire Esputnik Event Triggers Summary

**orders/create webhook enqueues INITIALIZED to Esputnik, and keyCRM handler passes pickupAddress via static PICKUP_ADDRESS_MAP for READY_FOR_PICKUP events — completing all 7 email lifecycle trigger paths**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-01T12:11:02Z
- **Completed:** 2026-03-01T12:14:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Wired orders/create Shopify webhook to esputnikOrderQueue with status INITIALIZED, completing the first lifecycle event trigger
- Added PICKUP_ADDRESS_MAP constant with DEPLOYMENT BLOCKER comment documenting all 4 store addresses and required keyCRM admin steps
- pickupAddress now passed to queue jobs for READY_FOR_PICKUP events via conditional spread
- All 7 Esputnik order email events (INITIALIZED, CONFIRMED, IN_PROGRESS, DELIVERED, READY_FOR_PICKUP, OUT_OF_STOCK, CANCELLED) now have code-level trigger paths

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire orders/create webhook to Esputnik queue** - `e701084` (feat)
2. **Task 2: Add pickup address static map and passthrough in keyCRM handler** - `d47a62c` (feat)

**Plan metadata:** TBD (docs: complete plan)

## Files Created/Modified
- `app/routes/webhooks.orders.create.tsx` - Added esputnikOrderQueue import and INITIALIZED job enqueue; removed dead else branch
- `app/service/keycrm/keycrm-shopify-sync.service.ts` - Added PICKUP_ADDRESS_MAP constant with DEPLOYMENT BLOCKER comment; updated esputnikOrderQueue.add() to pass pickupAddress for READY_FOR_PICKUP events

## Decisions Made
- INITIALIZED fires on orders/create, not keyCRM status 3 (which is CONFIRMED) — prevents double-sending order-created email
- PICKUP_ADDRESS_MAP intentionally empty: keyCRM status IDs for "готово до самовивозу" must be confirmed in admin panel before go-live; all 4 known store addresses documented in the DEPLOYMENT BLOCKER comment
- Conditional spread `...(pickupAddress && { pickupAddress })` omits the field entirely when map lookup returns undefined

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. Pre-existing TypeScript errors in unrelated files (api.customer.ts, api.order.$orderId.ts, app._index.tsx) were noted as out-of-scope per deviation rules and not touched.

## User Setup Required

**DEPLOYMENT BLOCKER — must resolve before go-live:**

1. Open keyCRM admin panel → Settings → Order Statuses
2. Find the status ID(s) for each "готово до самовивозу" store location
3. Populate `PICKUP_ADDRESS_MAP` in `app/service/keycrm/keycrm-shopify-sync.service.ts`:
   - Mio Mio — пр Соборний 186, м. Запоріжжя
   - Mio Mio Best — пр Соборний 189, м. Запоріжжя
   - Світлана — пр Соборний 92 (ТР Верже), м. Запоріжжя
   - Світлана — пр Соборний 189, м. Запоріжжя

**Also required before go-live (from plan verification checklist):**

1. Upload all 7 templates to Esputnik: Messages → Email → New Template
2. Create 7 Workflows in Esputnik → Automation → Workflows, one per event type
3. Test with a real order: create order in Shopify → verify INITIALIZED email arrives

## Next Phase Readiness

- All 7 Esputnik email lifecycle events have code-level trigger paths
- Phase 04 is complete — all plans (04-01 through 04-04) finished
- DEPLOYMENT BLOCKER in PICKUP_ADDRESS_MAP must be resolved before going live with READY_FOR_PICKUP emails
- Manual Esputnik workflow setup required (upload templates, create automation workflows)

---
*Phase: 04-create-sputnik-email-templates-and-update-order-event-flows*
*Completed: 2026-03-01*

## Self-Check: PASSED

- FOUND: app/routes/webhooks.orders.create.tsx
- FOUND: app/service/keycrm/keycrm-shopify-sync.service.ts
- FOUND: .planning/phases/04-create-sputnik-email-templates-and-update-order-event-flows/04-04-SUMMARY.md
- FOUND commit: e701084 (feat: wire orders/create webhook to Esputnik INITIALIZED queue)
- FOUND commit: d47a62c (feat: add PICKUP_ADDRESS_MAP and pickupAddress passthrough for READY_FOR_PICKUP)
