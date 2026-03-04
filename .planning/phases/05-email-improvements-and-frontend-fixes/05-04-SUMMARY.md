---
phase: 05-email-improvements-and-frontend-fixes
plan: "04"
subsystem: keycrm-integration
tags:
  - keycrm
  - esputnik
  - order-comments
  - tracking-number
  - deployment-blocker
dependency_graph:
  requires:
    - 05-03
  provides:
    - keycrm-refused-delivery-status-documented
    - keycrm-buyer-manager-comment-split
    - keycrm-tracking-number-passthrough
  affects:
    - app/shared/config/keycrm.ts
    - app/service/keycrm/keycrm-order.service.ts
    - app/service/keycrm/keycrm-shopify-sync.service.ts
tech_stack:
  added: []
  patterns:
    - DEPLOYMENT BLOCKER comment pattern for unknown status IDs
    - Direct payload field access over combined note string parsing
    - Conditional spread for optional queue job fields
key_files:
  created: []
  modified:
    - app/shared/config/keycrm.ts
    - app/service/keycrm/keycrm-order.service.ts
    - app/service/keycrm/keycrm-shopify-sync.service.ts
decisions:
  - "Відмова від отримання DEPLOYMENT BLOCKER comment-only: no placeholder number added to avoid incorrect runtime behavior; admin must confirm ID before go-live"
  - "extractCustomerNote filters note lines by prefix (Метод оплати:, Промокод:) to separate customer content from technical content"
  - "buildManagerComment uses payload.discount_codes[] and payload.payment_gateway_names[] directly instead of parsing the combined note string"
  - "trackingNumber extraction uses typeof guard + trim() to safely handle absent context.ttn"
metrics:
  duration_minutes: 15
  completed_date: "2026-03-04"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 3
  files_created: 0
---

# Phase 05 Plan 04: keyCRM Integration Improvements Summary

**One-liner:** keyCRM order comments split into buyer/manager fields from direct payload, tracking number wired from context.ttn to eSputnik queue, Відмова від отримання status documented with DEPLOYMENT BLOCKER.

## What Was Built

Three targeted keyCRM integration improvements:

1. **Відмова від отримання DEPLOYMENT BLOCKER** (`keycrm.ts`) — Added comment-only documentation in both `esputnikStatusMap` and `cancelStatusIds` explaining that the refused-delivery status ID is unknown and must be confirmed in keyCRM admin panel before go-live. No runtime placeholder number added (that would cause incorrect production behavior).

2. **Comment routing split** (`keycrm-order.service.ts`) — Introduced `extractCustomerNote()` that filters the combined Shopify `note` field by stripping lines starting with "Метод оплати:" or "Промокод:", leaving only customer-facing content for `buyer_comment`. Refactored `buildManagerComment()` to use `payload.payment_gateway_names[0]` and `payload.discount_codes[]` directly (not parsed from the note string), sending technical order info to `manager_comment`.

3. **Tracking number passthrough** (`keycrm-shopify-sync.service.ts`) — Extracts `context.ttn` from the keyCRM webhook context using a `typeof` + `trim()` guard, then passes it as `trackingNumber` to `esputnikOrderQueue.add()`. When absent the conditional spread omits the field, and the template's `#if` guard prevents the tracking block from rendering.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add Відмова від отримання DEPLOYMENT BLOCKER to keycrm.ts | 2685f20 | app/shared/config/keycrm.ts |
| 2 | Split keyCRM comment routing and wire trackingNumber passthrough | 36bbf01 | app/service/keycrm/keycrm-order.service.ts, app/service/keycrm/keycrm-shopify-sync.service.ts |

## Decisions Made

- **Відмова від отримання comment-only**: No numeric placeholder added (e.g. `99: "CANCELLED"`) to avoid any chance of a wrong ID triggering incorrect emails or cancellations in production. Only comments document the requirement.

- **extractCustomerNote prefix-filter strategy**: Rather than trying to detect "is this a customer note?" heuristically, the function excludes known technical prefixes. Viber preference lines (starting with ⚠️) pass through to `buyer_comment` intentionally — they are customer-facing communication preferences.

- **Direct payload fields for manager comment**: `payment_gateway_names[0]` and `discount_codes[]` come directly from the Shopify webhook payload, making `buildManagerComment` independent of the combined note string format used in `create.ts`.

- **trackingNumber conditional spread**: `...(trackingNumber && { trackingNumber })` follows the same pattern already used for `pickupAddress`, keeping the queue job interface consistent.

## Deviations from Plan

None — plan executed exactly as written.

## Verification Results

- `DEPLOYMENT BLOCKER` appears in keycrm.ts at lines 31 and 41 (for Відмова від отримання)
- `Відмова від отримання` appears 4 times in keycrm.ts (comment documentation)
- `buyer_comment` present in keycrm-order.service.ts (interface definition + spread in return)
- `discount_codes` present in buildManagerComment (direct payload access)
- `context.ttn` present in keycrm-shopify-sync.service.ts
- `trackingNumber` present in esputnikOrderQueue.add() call
- TypeScript: no errors in target files (pre-existing errors in unrelated test scripts are out of scope)

## Self-Check: PASSED

Files confirmed created/modified:
- FOUND: app/shared/config/keycrm.ts (modified)
- FOUND: app/service/keycrm/keycrm-order.service.ts (modified)
- FOUND: app/service/keycrm/keycrm-shopify-sync.service.ts (modified)

Commits confirmed:
- FOUND: 2685f20 feat(05-04): add Відмова від отримання DEPLOYMENT BLOCKER to keycrm.ts
- FOUND: 36bbf01 feat(05-04): split keyCRM comment routing and wire trackingNumber passthrough
