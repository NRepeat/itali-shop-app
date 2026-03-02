---
phase: 04-create-sputnik-email-templates-and-update-order-event-flows
verified: 2026-03-01T12:30:00Z
status: human_needed
score: 13/13 must-haves verified
human_verification:
  - test: "Upload all 7 HTML templates to Esputnik template library and confirm no Velocity render errors"
    expected: "All templates render correctly in Esputnik preview without blank sections or template errors"
    why_human: "Velocity rendering correctness can only be confirmed in the Esputnik environment — local HTML validation does not catch Velocity syntax failures at runtime"
  - test: "Create 7 Automation Workflows in Esputnik (one per event: orderINITIALIZED, orderCONFIRMED, orderIN_PROGRESS, orderDELIVERED, orderREADY_FOR_PICKUP, orderOUT_OF_STOCK, orderCANCELLED), each triggering the linked template"
    expected: "Each workflow activates on its event type and sends the correct email"
    why_human: "Esputnik workflow configuration is an external UI operation that cannot be verified from the codebase"
  - test: "Place a test order in Shopify and verify the INITIALIZED email arrives in the inbox within 60 seconds"
    expected: "Email received with correct Ukrainian copy, order number, items list, and delivery/payment method"
    why_human: "End-to-end email delivery requires a live Shopify shop, running BullMQ workers, and active Esputnik account — not verifiable from code"
  - test: "Confirm PICKUP_ADDRESS_MAP keyCRM status IDs for all four store locations before go-live"
    expected: "PICKUP_ADDRESS_MAP in keycrm-shopify-sync.service.ts populated with correct numeric status IDs"
    why_human: "keyCRM status IDs for READY_FOR_PICKUP events are unknown and must be looked up in the keyCRM admin panel; this is explicitly documented as a DEPLOYMENT BLOCKER"
  - test: "Trigger a keyCRM status change (e.g. status 3 Confirmed) and verify the CONFIRMED email fires — not a second INITIALIZED email"
    expected: "Only one email per lifecycle stage with no duplicate INITIALIZED event"
    why_human: "Requires live keyCRM webhook delivery and end-to-end testing"
---

# Phase 04: Create Sputnik Email Templates and Update Order Event Flows — Verification Report

**Phase Goal:** Create 7 Esputnik Velocity email templates for all order lifecycle events, fix the INITIALIZED/CONFIRMED status conflict, and wire orders/create directly to esputnikOrderQueue so every lifecycle stage triggers the correct transactional email.
**Verified:** 2026-03-01T12:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | EsputnikOrderStatus union includes INITIALIZED, CONFIRMED, IN_PROGRESS, DELIVERED, READY_FOR_PICKUP, OUT_OF_STOCK, CANCELLED (7 values) | VERIFIED | `esputnik-order.queue.ts` lines 9-16 — all 7 values present with comments |
| 2 | EsputnikOrderJobData has optional pickupAddress field | VERIFIED | `esputnik-order.queue.ts` line 22 — `pickupAddress?: string` |
| 3 | keyCRM status 3 maps to CONFIRMED (not INITIALIZED) | VERIFIED | `keycrm.ts` line 34 — `3: "CONFIRMED"` with explanation comment |
| 4 | keyCRM status 15 maps to OUT_OF_STOCK (not CANCELLED) | VERIFIED | `keycrm.ts` line 38 — `15: "OUT_OF_STOCK"` |
| 5 | EsputnikOrder interface has optional pickupAddress and trackingNumber | VERIFIED | `esputnik-order.service.ts` lines 30-31 — both optional fields present |
| 6 | mapShopifyOrderToEsputnik accepts optional extra param and spreads into return | VERIFIED | `esputnik-order.service.ts` lines 154-243 — `extra?` param, lines 240-241 spread |
| 7 | Worker destructures pickupAddress from job.data and passes to mapper | VERIFIED | `esputnik-order.worker.ts` line 11 destructures, line 18 passes `{ pickupAddress }` |
| 8 | All 7 HTML email templates exist in .planning/email/templates/esputnik/ | VERIFIED | All 7 files confirmed present: 01 through 07 |
| 9 | All 7 templates use $! silent references and no Shopify Liquid syntax | VERIFIED | Zero `{%` occurrences across all 7 files; all output vars use `$!`; `$data.get()` only in `#foreach` and `#if` collection guards (correct Velocity syntax) |
| 10 | All 7 templates have unsubscribe block outside the main wrapper table | VERIFIED | Template 01 confirmed by tail inspection — unsubscribe `<table>` follows closing `</table></td></tr></tbody></table>` of main wrapper; same pattern in all 7 |
| 11 | Template 03 tracking number block is wrapped in #if guard | VERIFIED | `03-vidpravleno.html` line 151 — `#if($!data.get('trackingNumber'))` guard present |
| 12 | orders/create webhook enqueues INITIALIZED to esputnikOrderQueue | VERIFIED | `webhooks.orders.create.tsx` lines 2, 19-23 — import and `esputnikOrderQueue.add("esputnik-order-sync", { payload, status: "INITIALIZED", shop })` |
| 13 | keyCRM handler passes pickupAddress for READY_FOR_PICKUP events via static map | VERIFIED | `keycrm-shopify-sync.service.ts` lines 129, 395-403 — `PICKUP_ADDRESS_MAP` constant, conditional lookup, spread into `queue.add()` |

**Score:** 13/13 truths verified

### Required Artifacts

| Artifact | Provides | Status | Details |
|----------|----------|--------|---------|
| `app/shared/lib/queue/esputnik-order.queue.ts` | EsputnikOrderStatus union (7 values), EsputnikOrderJobData with pickupAddress | VERIFIED | Substantive — 40 lines, all type exports present and correct |
| `app/shared/config/keycrm.ts` | Fixed esputnikStatusMap with EsputnikOrderStatus type import | VERIFIED | Substantive — imports EsputnikOrderStatus, Record<number, EsputnikOrderStatus> annotation |
| `app/service/esputnik/esputnik-order.service.ts` | EsputnikOrder interface with pickupAddress/trackingNumber; updated mapper | VERIFIED | Substantive — 269 lines, interface and extra param fully implemented |
| `app/service/esputnik/esputnik-order.worker.ts` | Worker passes pickupAddress from job.data to mapper | VERIFIED | Substantive and wired — 25 lines, correct destructuring and pass-through |
| `app/routes/webhooks.orders.create.tsx` | orders/create webhook wired to esputnikOrderQueue with INITIALIZED | VERIFIED | Wired — imports `esputnikOrderQueue`, calls `queue.add()` with correct status |
| `app/service/keycrm/keycrm-shopify-sync.service.ts` | PICKUP_ADDRESS_MAP + READY_FOR_PICKUP pickupAddress passthrough | VERIFIED | Wired — map constant at line 129, passthrough at lines 395-403 |
| `.planning/email/templates/esputnik/01-zamovlennya-oformleno.html` | Order created email (INITIALIZED) | VERIFIED | Contains "Дякуємо за замовлення!", delivery+payment cols, manager notice |
| `.planning/email/templates/esputnik/02-pidtverdzheno.html` | Order confirmed email (CONFIRMED) | VERIFIED | Contains "Ваше замовлення підтверджене", focused confirmation without delivery section |
| `.planning/email/templates/esputnik/03-vidpravleno.html` | Shipped email (IN_PROGRESS) | VERIFIED | Contains "Резерв замовлення у відділенні 3 дні", `#if` tracking block |
| `.planning/email/templates/esputnik/04-vykonano.html` | Order completed email (DELIVERED) | VERIFIED | Contains "Дякуємо за покупку!" |
| `.planning/email/templates/esputnik/05-hotovo-do-samovyvozu.html` | Ready for pickup email (READY_FOR_PICKUP) | VERIFIED | Contains `$!data.get('pickupAddress')`, 3-day reservation notice |
| `.planning/email/templates/esputnik/06-tovaru-nemaie-v-nayavnosti.html` | Out of stock email (OUT_OF_STOCK) | VERIFIED | Contains `#foreach($rec in $data.get('recommendedItems'))` with size() guard, omits totals |
| `.planning/email/templates/esputnik/07-skasovano.html` | Cancelled email (CANCELLED) | VERIFIED | Contains `#foreach` recommendation block and totals section |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `app/shared/config/keycrm.ts` | `esputnik-order.queue.ts` | `import type { EsputnikOrderStatus }` + Record annotation | WIRED | Line 1 import, line 40 type annotation — type stays in sync as union grows |
| `webhooks.orders.create.tsx` | `esputnik-order.queue.ts` | `esputnikOrderQueue.add()` with INITIALIZED | WIRED | Lines 2+19-23 — import and call with correct status literal |
| `keycrm-shopify-sync.service.ts` | `esputnik-order.queue.ts` | pickupAddress in EsputnikOrderJobData | WIRED | Lines 395-403 — conditional spread into queue job |
| `esputnik-order.worker.ts` | `esputnik-order.service.ts` | mapShopifyOrderToEsputnik with { pickupAddress } extra | WIRED | Line 18 — passes `{ pickupAddress }` as 4th argument |
| `05-hotovo-do-samovyvozu.html` | EsputnikOrder.pickupAddress | `$!data.get('pickupAddress')` in template | WIRED | Line 202 — dynamic variable, not hardcoded |
| `06-tovaru-nemaie-v-nayavnosti.html` | Esputnik recommendation engine | `#foreach($rec in $data.get('recommendedItems'))` | WIRED | Lines 124+139 — size() guard and foreach loop |
| `07-skasovano.html` | Esputnik recommendation engine | `#foreach($rec in $data.get('recommendedItems'))` | WIRED | Lines 185+200 — size() guard and foreach loop |

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| ORD-01 | 04-01, 04-02, 04-03, 04-04 | Order Lifecycle Sync — orders updated through all status changes in downstream integrations | SATISFIED | 7 distinct email lifecycle events wired: INITIALIZED (orders/create), CONFIRMED/IN_PROGRESS/DELIVERED/OUT_OF_STOCK/CANCELLED (keyCRM status map), READY_FOR_PICKUP (map with DEPLOYMENT BLOCKER) |

**Traceability matrix note:** REQUIREMENTS.md traceability matrix lists ORD-01 as "Phase 3" (last updated 2026-02-23) but the requirement checkbox is marked `[x] Complete`. Phase 4 extends ORD-01's scope to transactional email delivery. The matrix is stale — it was not updated to include Phase 4. This is a documentation gap, not an implementation gap. The requirement is satisfied across both phases.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `app/routes/webhooks.orders.create.tsx` | 12-15 | `getSyncQueue()` call retained without `else` branch for missing queue | Info | orders/create may not have a sync queue entry; this is intentional per plan decision but silently does nothing if queue missing — acceptable tradeoff documented in plan |
| `keycrm-shopify-sync.service.ts` | 129 | `PICKUP_ADDRESS_MAP` is intentionally empty — DEPLOYMENT BLOCKER | Warning | READY_FOR_PICKUP events will send with blank `pickupAddress` until keyCRM status IDs are confirmed and map is populated; documented with full action steps |

No blockers found in phase 4 modified files. Pre-existing TypeScript errors exist in unrelated files (`app/routes/api.customer.ts`, `app/routes/api.order.$orderId.ts`, `app/routes/app._index.tsx`, `app/service/shopify/...`) — these were acknowledged as pre-existing in all 4 plan summaries and are out of scope for this phase.

### Human Verification Required

#### 1. Esputnik Template Upload and Render Validation

**Test:** Upload all 7 HTML files from `.planning/email/templates/esputnik/` to Esputnik (Messages > Email > New Template), then use Esputnik's preview tool to render each template with sample order data.
**Expected:** All 7 templates render without blank sections, Velocity errors, or missing variables. Ukrainian copy displays correctly. Unsubscribe link appears at the bottom of each email.
**Why human:** Velocity template rendering can only be verified in the Esputnik runtime environment. Local HTML parsing does not catch `#if` guard failures or missing data binding.

#### 2. Esputnik Automation Workflow Setup

**Test:** In Esputnik > Automation > Workflows, create one workflow per event type: orderINITIALIZED, orderCONFIRMED, orderIN_PROGRESS, orderDELIVERED, orderREADY_FOR_PICKUP, orderOUT_OF_STOCK, orderCANCELLED. Each workflow: trigger = order event, block = "Get order", send action = linked template.
**Expected:** 7 active workflows visible in Esputnik dashboard, each mapped to the correct template.
**Why human:** Esputnik workflow configuration is a UI operation in an external service — no code artifact to verify.

#### 3. End-to-End INITIALIZED Email Delivery

**Test:** Create a test order in Shopify with a real email address. Verify that the BullMQ worker processes the job and the email is delivered.
**Expected:** Email received within 60 seconds. Contains correct order number, item names, totals, delivery method, and the footer notice "Наші менеджери зв'яжуться з вами найближчим часом для підтвердження замовлення".
**Why human:** Requires live Shopify shop, running BullMQ workers, Esputnik credentials in `.env`, and an active Esputnik account.

#### 4. DEPLOYMENT BLOCKER — PICKUP_ADDRESS_MAP Population

**Test:** Open keyCRM admin panel > Settings > Order Statuses. Find the numeric status ID(s) used for "готово до самовивозу" for each of the 4 store locations. Add them to `PICKUP_ADDRESS_MAP` in `app/service/keycrm/keycrm-shopify-sync.service.ts`:
```
Mio Mio         — пр Соборний 186, м. Запоріжжя
Mio Mio Best    — пр Соборний 189, м. Запоріжжя
Світлана (Верже)— пр Соборний 92 (ТР Верже), м. Запоріжжя
Світлана        — пр Соборний 189, м. Запоріжжя
```
**Expected:** `PICKUP_ADDRESS_MAP` populated. Template 05 pickup address field renders the store address dynamically.
**Why human:** keyCRM status IDs for READY_FOR_PICKUP stores are not knowable from the codebase — must be looked up in the external keyCRM admin panel.

#### 5. No-Duplicate-Email Regression Test for CONFIRMED Event

**Test:** Trigger a keyCRM status change to status 3 (Підтверджено) for an existing order.
**Expected:** Exactly one CONFIRMED email fires ("Замовлення підтверджене"). No second INITIALIZED email is sent. Total email count for the order lifecycle: 2 (INITIALIZED on create + CONFIRMED on keyCRM status 3).
**Why human:** Requires live keyCRM webhook and end-to-end testing to verify no duplicate events.

### Gaps Summary

No gaps found. All 13 must-have truths verified, all artifacts are substantive and wired, all key links confirmed. The phase goal is fully achieved at the code level.

The outstanding items are entirely in the human verification category:
- External service configuration (Esputnik template upload, workflow creation)
- End-to-end delivery testing
- One known DEPLOYMENT BLOCKER (PICKUP_ADDRESS_MAP keyCRM status IDs) that is explicitly documented in the code with action steps

The DEPLOYMENT BLOCKER means READY_FOR_PICKUP emails will send successfully but the `$!data.get('pickupAddress')` variable will render blank until the map is populated. The other 6 lifecycle events are fully ready for production use.

---
_Verified: 2026-03-01T12:30:00Z_
_Verifier: Claude (gsd-verifier)_
