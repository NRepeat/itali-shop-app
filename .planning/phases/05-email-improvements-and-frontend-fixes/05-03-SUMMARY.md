---
phase: 05-email-improvements-and-frontend-fixes
plan: 03
subsystem: api
tags: [esputnik, email, bullmq, typescript, shopify]

# Dependency graph
requires:
  - phase: 04-create-sputnik-email-templates-and-update-order-event-flows
    provides: esputnik-order.service.ts, esputnik-order.worker.ts, esputnik-order.queue.ts

provides:
  - Product URLs in eSputnik order emails use correct miomio.com.ua domain
  - Email line-item images always use product featured image (not variant image)
  - trackingNumber flows from queue job data through worker to eSputnik order payload

affects: [esputnik-email-delivery, order-email-pipeline]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "trackingNumber passed through EsputnikOrderJobData.trackingNumber -> worker destructure -> mapShopifyOrderToEsputnik extra param"

key-files:
  created: []
  modified:
    - app/shared/lib/queue/esputnik-order.queue.ts
    - app/service/esputnik/esputnik-order.service.ts
    - app/service/esputnik/esputnik-order.worker.ts

key-decisions:
  - "Always use featuredImageUrl for email line-item images: variant images show incorrect product photo in notification context"
  - "trackingNumber carried in EsputnikOrderJobData alongside pickupAddress: both are event-specific extras not in base order payload"

patterns-established:
  - "Queue job data interface carries all event-specific extras (pickupAddress, trackingNumber) as optional fields"
  - "Worker destructures extras from job.data and passes as named object to service mapper"

requirements-completed: [ORD-01]

# Metrics
duration: 1min
completed: 2026-03-04
---

# Phase 05 Plan 03: eSputnik Order Service Bug Fixes Summary

**Fixed wrong product URL domain (app.miomio.com.ua -> miomio.com.ua), switched to featured image for email items, and wired trackingNumber from queue through worker to eSputnik payload**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-04T13:24:14Z
- **Completed:** 2026-03-04T13:25:22Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Fixed product links in emails: removed erroneous `app.` subdomain so links correctly point to miomio.com.ua
- Fixed email line-item image: always use the featured product image instead of variant-specific image (variant images show wrong photo for email context)
- Completed trackingNumber pipeline: added field to `EsputnikOrderJobData` interface, destructured in worker, passed through `extra` object to `mapShopifyOrderToEsputnik` — enabling template 03 (shipped) to show the tracking number

## Task Commits

Each task was committed atomically:

1. **Task 1: Add trackingNumber to queue interface and fix esputnik-order.service.ts** - `af95531` (fix)
2. **Task 2: Update worker to pass trackingNumber through to mapper** - `f0ca8cc` (fix)

**Plan metadata:** see final commit below

## Files Created/Modified
- `app/shared/lib/queue/esputnik-order.queue.ts` - Added `trackingNumber?: string` field to `EsputnikOrderJobData` interface
- `app/service/esputnik/esputnik-order.service.ts` - Fixed URL domain (removed `app.` prefix), simplified imageUrl to always use `featuredImageUrl`
- `app/service/esputnik/esputnik-order.worker.ts` - Destructured `trackingNumber` from `job.data`, added to `extra` object passed to mapper

## Decisions Made
- Always use `featuredImageUrl` for email line-item images: variant images were fetched from Shopify but assigned inconsistently (fallback order was variant.image -> productImages[i] -> productImages[0]). Featured image is the canonical product photo and appropriate for email notification context.
- `trackingNumber` stored in queue job data alongside `pickupAddress`: both are event-specific extras the webhook handler must inject into the order event, not derivable from the base Shopify order payload alone.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
Pre-existing TypeScript errors exist in `scripts/test-esputnik-*.ts` files (variable redeclarations across standalone script files). These are out-of-scope pre-existing issues. The three modified service/queue/worker files have zero type errors.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- eSputnik order email pipeline is now fully wired for trackingNumber: the IN_PROGRESS event template 03 will correctly receive and display the tracking number when the caller provides it in queue job data
- The `mapShopifyOrderToEsputnik` `extra` parameter pattern established in phase 04 is complete and consistent for both `pickupAddress` and `trackingNumber`

---
*Phase: 05-email-improvements-and-frontend-fixes*
*Completed: 2026-03-04*
