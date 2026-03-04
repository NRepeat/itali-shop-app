---
phase: 05-email-improvements-and-frontend-fixes
plan: 05
subsystem: nnshop-frontend
tags: [quick-order, footer, viber, checkout, delivery, phone]
dependency_graph:
  requires: []
  provides: [quick-order-phone-fix, viber-footer-link, delivery-section-removal]
  affects: [QuickBuyModal, Footer, checkout-receipt-sidebar]
tech_stack:
  added: []
  patterns: [inline-svg-icon, viber-deep-link, return-null-component]
key_files:
  created: []
  modified:
    - /Users/mnmac/Development/nnshop/src/features/product/quick-buy/ui/QuickBuyModal.tsx
    - /Users/mnmac/Development/nnshop/src/widgets/footer/ui/Footer.tsx
    - /Users/mnmac/Development/nnshop/src/features/checkout/receipt/ui/DeliveryInfo.tsx
    - /Users/mnmac/Development/nnshop/app/[locale]/(frontend)/(checkout)/checkout/@receipt/payment/page.tsx
    - /Users/mnmac/Development/nnshop/app/[locale]/(frontend)/(checkout)/checkout/@receipt/success/[orderId]/page.tsx
decisions:
  - "DeliveryCard inline components in receipt pages removed in addition to DeliveryInfo.tsx stub — the actual delivery rendering was implemented directly in page files, not via the DeliveryInfoSection component"
  - "ViberIcon uses filled SVG path matching Viber brand shape; viber:// deep link uses %2B380972179292 (E.164 URL-encoded)"
  - "phone1 translation value confirmed as 097-217-92-92 in messages/uk.json"
metrics:
  duration_minutes: 25
  completed_date: "2026-03-04"
  tasks_completed: 2
  files_changed: 5
---

# Phase 05 Plan 05: Frontend Fixes — Phone Default, Viber Footer, Delivery Removal Summary

**One-liner:** Quick order phone default fixed to +380, Viber icon/link added to Footer contacts, delivery section removed from checkout receipt sidebar via null stub and inline DeliveryCard removal.

## Tasks Completed

| # | Name | Files | Status |
|---|------|-------|--------|
| 1 | Fix quick order phone default and add Viber to Footer | QuickBuyModal.tsx, Footer.tsx | Complete |
| 2 | Remove delivery section from checkout receipt sidebar | DeliveryInfo.tsx, payment/page.tsx, success/page.tsx | Complete |
| 3 | Checkpoint: Verify all frontend changes | — | AWAITING HUMAN VERIFY |

## Changes Made

### Task 1: Quick Order Phone Fix + Viber Footer

**QuickBuyModal.tsx** (`/Users/mnmac/Development/nnshop/src/features/product/quick-buy/ui/QuickBuyModal.tsx`):
- Changed `phone: '+38'` → `phone: '+380'` in `useForm` `defaultValues`
- Changed `phone: '+38'` → `phone: '+380'` in `form.reset(...)` inside `useEffect`

**Footer.tsx** (`/Users/mnmac/Development/nnshop/src/widgets/footer/ui/Footer.tsx`):
- Added `ViberIcon` inline SVG component (follows same pattern as `FacebookIcon`, `InstagramIcon`)
- Added Viber link row after phone block: `viber://chat?number=%2B380972179292` — uses phone1 `097-217-92-92` in E.164 format

### Task 2: Remove Delivery Section from Checkout Receipt

**DeliveryInfo.tsx** (`/Users/mnmac/Development/nnshop/src/features/checkout/receipt/ui/DeliveryInfo.tsx`):
- Replaced entire component body with `return null` — cleared all imports and logic

**payment/page.tsx** (`checkout/@receipt/payment/page.tsx`) — Auto-fix (Rule 1):
- Removed `DeliveryCard` async component definition
- Removed `<Suspense><DeliveryCard /></Suspense>` JSX block from Desktop sidebar
- Removed unused `Truck` import from lucide-react
- Removed unused `getDeliveryInfo` import

**success/[orderId]/page.tsx** (`checkout/@receipt/success/[orderId]/page.tsx`) — Auto-fix (Rule 1):
- Removed `DeliveryCard` async component definition
- Removed `<Suspense><DeliveryCard /></Suspense>` JSX block from receipt card
- Removed unused `Truck` import from lucide-react
- Removed unused `getDeliveryInfo` import

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] DeliveryCard inline components not covered by plan scope**
- **Found during:** Task 2 — search for DeliveryInfoSection usage
- **Issue:** `DeliveryInfoSection` (from `DeliveryInfo.tsx`) was never imported by the checkout receipt pages. Those pages implemented their own inline `DeliveryCard` async components that called `getDeliveryInfo` directly. Simply stubbing `DeliveryInfo.tsx` would not remove the delivery cards visible in the UI.
- **Fix:** Removed `DeliveryCard` component definitions and their Suspense usages from both `payment/page.tsx` and `success/[orderId]/page.tsx`. Also cleaned up unused imports (`Truck`, `getDeliveryInfo`).
- **Files modified:** `checkout/@receipt/payment/page.tsx`, `checkout/@receipt/success/[orderId]/page.tsx`

## Verification Checks

- `grep "+380'" QuickBuyModal.tsx` → 2 matches (defaultValues + form.reset) [PASS]
- `grep "phone: '\+38'" QuickBuyModal.tsx` → 0 matches (old value gone) [PASS]
- `grep "viber://" Footer.tsx` → 1 match [PASS]
- `grep "ViberIcon" Footer.tsx` → 2 matches (definition + usage) [PASS]
- `grep "phone1" messages/uk.json` → `"097-217-92-92"` [PASS]
- `DeliveryCard` removed from both checkout receipt pages [PASS]
- `DeliveryInfo.tsx` returns null [PASS]

## Checkpoint Awaiting

Task 3 is a `checkpoint:human-verify` gate. Human must:
1. Start dev server: `cd /Users/mnmac/Development/nnshop && npm run dev`
2. Open any product page → click "Швидке замовлення" → confirm phone starts with "+380"
3. Add item to cart → confirm cart sidebar opens immediately
4. Open Footer → confirm Viber icon appears with viber:// link
5. Navigate to checkout receipt page → confirm NO delivery section in right sidebar
6. Check order status badges on account page

## Self-Check

Files confirmed modified:
- `/Users/mnmac/Development/nnshop/src/features/product/quick-buy/ui/QuickBuyModal.tsx` — FOUND
- `/Users/mnmac/Development/nnshop/src/widgets/footer/ui/Footer.tsx` — FOUND
- `/Users/mnmac/Development/nnshop/src/features/checkout/receipt/ui/DeliveryInfo.tsx` — FOUND
- `/Users/mnmac/Development/nnshop/app/[locale]/(frontend)/(checkout)/checkout/@receipt/payment/page.tsx` — FOUND
- `/Users/mnmac/Development/nnshop/app/[locale]/(frontend)/(checkout)/checkout/@receipt/success/[orderId]/page.tsx` — FOUND

## Self-Check: NOTE — Bash unavailable in session

Git commits could not be created — Bash tool was denied for this session. All file edits are complete and verified via Read/Grep tools. Commits must be made manually or by re-running with Bash permissions:

```bash
# Task 1 commit (in /Users/mnmac/Development/nnshop):
git add src/features/product/quick-buy/ui/QuickBuyModal.tsx
git add src/widgets/footer/ui/Footer.tsx
git commit -m "feat(05-05): fix quick order phone default to +380 and add Viber link to footer"

# Task 2 commit (in /Users/mnmac/Development/nnshop):
git add src/features/checkout/receipt/ui/DeliveryInfo.tsx
git add "app/[locale]/(frontend)/(checkout)/checkout/@receipt/payment/page.tsx"
git add "app/[locale]/(frontend)/(checkout)/checkout/@receipt/success/[orderId]/page.tsx"
git commit -m "feat(05-05): remove delivery section from checkout receipt sidebar"
```
