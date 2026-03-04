# Phase 5: Email Improvements and Frontend Fixes - Research

**Researched:** 2026-03-04
**Domain:** eSputnik Velocity templates, keyCRM integration, Next.js 15 storefront (nnshop)
**Confidence:** HIGH — all findings sourced directly from the live codebase

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Email — Visual & Formatting**
- Change all non-status text/colors from blue to black; order status badge remains blue
- Remove kopecks from all price displays (show whole hryvnias only)
- "UAH" label → "грн"
- Show order creation time in email (not just date)
- Remove delivery cost calculation row from emails
- Hide discount/знижка row entirely if no discount on the order
- Remove duplicate "Оплата" label (appears twice in current templates)

**Email — Content & Structure**
- Move "Наші менеджери…" text to top of email, directly under "Дякуємо за замовлення"
- Add order creation time to email header/order info block

**Email — Media & Links**
- Fix product URLs in line items (currently incorrect)
- Product images: use main/featured product photo (not variant image)
- Restore clickable link on logo (logo → site homepage)
- Change sender display name to "Міо Міо" + add Mio Mio logo to email header

**Email — Template-Specific: Відправлено (IN_PROGRESS)**
- Add tracking code block to the shipped email template
- Tracking number passed as param from keyCRM webhook (already implemented via `trackingNumber` field)

**Email — Template-Specific: Скасовано (CANCELLED)**
- Add recommended products block ("Вам може сподобатись")
- Source: related products from eSputnik recommendation engine (linked via `externalItemId`)

**keyCRM — New Status: Відмова від отримання**
- Add new keyCRM status ID for "Відмова від отримання" to the status map
- Duplicate Скасовано logic: send CANCELLED eSputnik event + cancel Shopify order + restock
- Status ID to be determined from keyCRM admin panel

**keyCRM — Order Comments Routing**
- Technical info (payment method, discount code) → move to "коментар для менеджера"
- Customer-visible info → move to "коментар клієнта"

**keyCRM — Tracking Code**
- Verify that tracking code is being correctly passed and stored when order is shipped

**keyCRM — Discount Code (промокод)**
- Investigate and implement discount code passthrough from Shopify order to keyCRM order notes

**Frontend — Checkout**
- Remove delivery/shipping section from checkout entirely (no delivery cost shown or calculated)

**Frontend — Cart**
- Show cart sidebar/drawer immediately when product is added to cart

**Frontend — Account Page (Особистий кабінет)**
- Status "Оброблено" badge → green color
- Status "Скасовано" badge → red color
- Status "Відмова від отримання" badge → red color
- Handle "Відмова від отримання" status update display

**Frontend — Quick Order (Швидке замовлення)**
- Default phone country code to Ukraine (+380)

**Frontend — Related Products**
- Link related products using matching SKU (not product ID)

**Frontend — Discount Application**
- Apply discount/promo code to order in checkout

**Frontend — Contact Info**
- Change phone number to 097 217 92 92
- Add Viber icon/link next to phone number

**Frontend — Navigation**
- Menu navigation updates (structure TBD — review current code first)

**Frontend — Brand Logos**
- Add logos for GHOUD and AGL brands to brand logo section

**Frontend — "Стежити за ціною" (Price Watch)**
- Test and verify "watch price" feature works correctly

### Claude's Discretion
- Exact eSputnik recommendation engine API call structure for related products
- Animation/transition for cart drawer appearing
- Exact navigation structure changes (read current code first)
- Viber icon sourcing (SVG or icon font)

### Deferred Ideas (OUT OF SCOPE)
- None — all items listed are within phase scope
</user_constraints>

---

## Summary

This phase spans three codebases in two repos: eSputnik email template HTML files in `.planning/email/templates/esputnik/` (itali-shop-app), keyCRM integration TypeScript files in `app/service/keycrm/` (itali-shop-app), and the Next.js 15 storefront (nnshop). All seven email templates already exist from Phase 4 and need targeted edits — no new templates need to be created from scratch.

The keyCRM workstream has three independent tasks: (1) adding a new status for "Відмова від отримання" to `esputnikStatusMap` and `cancelStatusIds` in `keycrm.ts`, (2) splitting the Shopify order `note` field into `buyer_comment` vs `manager_comment` in `keycrm-order.service.ts`, and (3) verifying/implementing discount code passthrough (the discount code is already written to `order.note` in `create.ts` — it needs to flow through the keyCRM `KeyCrmOrder` mapping). The frontend workstream is largely configuration/string changes: phone numbers live in `messages/uk.json` and `messages/ru.json`, the cart drawer already uses `useCartUIStore.openCart()` (already called on add-to-cart success), the `OrderStatusBadge` already handles "Відмова від отримання" as red, and brand logos are managed via Sanity CMS content — not code.

**Primary recommendation:** Work in three parallel streams — email template edits (all in `.planning/email/templates/esputnik/`), keyCRM TypeScript changes (keycrm.ts + keycrm-order.service.ts), and nnshop frontend changes (messages files + UI components). The most complex task is the eSputnik recommendation block in the CANCELLED template, which requires verifying the eSputnik `/recommendations` API call structure.

---

## Architecture Patterns

### File Locations

```
itali-shop-app/
├── .planning/email/templates/esputnik/
│   ├── 01-zamovlennya-oformleno.html    # INITIALIZED — needs formatting fixes
│   ├── 02-pidtverdzheno.html            # CONFIRMED — needs formatting fixes
│   ├── 03-vidpravleno.html              # IN_PROGRESS — tracking block already present
│   ├── 04-vykonano.html                 # DELIVERED — needs formatting fixes
│   ├── 05-hotovo-do-samovyvozu.html     # READY_FOR_PICKUP — needs formatting fixes
│   ├── 06-tovaru-nemaie-v-nayavnosti.html # OUT_OF_STOCK — has recommendation block
│   └── 07-skasovano.html                # CANCELLED — has recommendation block
├── app/service/esputnik/
│   └── esputnik-order.service.ts        # mapShopifyOrderToEsputnik, sendOrderToEsputnik
├── app/service/keycrm/
│   ├── keycrm-order.service.ts          # mapShopifyOrderToKeyCrm, createOrderInKeyCrm
│   └── keycrm-shopify-sync.service.ts   # handleKeyCrmOrderStatusChange
└── app/shared/config/
    ├── keycrm.ts                        # KEYCRM_CONFIG with esputnikStatusMap
    └── esputnik.ts                      # ESPUTNIK_CONFIG

nnshop/
├── messages/
│   ├── uk.json                          # phone1/phone2, phonePlaceholder
│   └── ru.json                          # same keys
├── src/features/
│   ├── order/ui/OrderStatusBadge.tsx    # already handles Відмова від отримання
│   ├── product/quick-buy/ui/QuickBuyModal.tsx  # phone default = '+38'
│   ├── header/cart/ui/CartSheetController.tsx  # uses useCartUIStore
│   └── cart/ui/DiscountCodeInput.tsx    # exists, needs checkout integration
├── src/entities/
│   ├── home/ui/BrendGrid/BrendGrid.tsx  # brand logos from Sanity CMS
│   └── product/api/getProductsBySku.ts  # SKU-based related products already exists
└── src/widgets/footer/ui/Footer.tsx     # phone1/phone2 from translations
```

### Pattern 1: eSputnik Velocity Template Structure

**What:** All 7 templates are standalone HTML files with Apache Velocity template language embedded. They live in `.planning/email/templates/esputnik/` and are copy-pasted manually into the eSputnik web editor.

**Current state observed:**
- Colors: `#05125C` (navy blue) used for ALL text/headings — needs to change to black (`#1a1a1a`) for non-status text
- Price rendering: `$!data.get('totalCost') $!data.get('currency')` — `totalCost` is a raw float (e.g. `1250.00`); to strip kopecks use `$math.floor($!data.get('totalCost'))` or `#set($price = $!data.get('totalCost').intValue())` — both are valid Velocity idioms
- Currency label: `$!data.get('currency')` outputs `UAH` — needs to be replaced with hardcoded `грн`
- Date: `$date.format('dd.MM.yyyy', $date.toDate($data.get('date')))` — add time: `$date.format('dd.MM.yyyy HH:mm', $date.toDate($data.get('date')))`
- Logo: `<img src="...">` is not wrapped in an anchor — needs `<a href="https://miomio.com.ua">` wrapper
- "Наші менеджери" text: currently at bottom of template 01 (`<!-- MANAGER NOTICE -->`) — must move to directly under the h2 "Дякуємо за замовлення!"
- Duplicate "Оплата" label: in some templates the Оплата section header appears both as a column header and as a standalone label — remove the redundant one
- Delivery row: `#if($data.get('shipping') and $data.get('shipping')!= "")` guard already exists — to remove delivery row entirely, delete the `<tr>` for Доставка in the totals section
- Discount row: `#if($data.get('discount') and $data.get('discount')!= "")` guard already present and correct — no change needed to the guard logic
- Product URL bug: `url` is passed as `https://app.miomio.com.ua/products/${productInfo.handle}` — the storefront domain is `miomio.com.ua`, not `app.miomio.com.ua`. Fix in `esputnik-order.service.ts` line 195–196: `https://miomio.com.ua/products/${productInfo.handle}`
- Product image: currently uses `variantImages.get(String(item.variant_id)) || featuredImageUrl` — to use featured image only, change to always use `productInfo.featuredImageUrl` (skip variant fallback chain)

**Template 03 (IN_PROGRESS) — tracking block:**
Already present with `#if($data.get('trackingNumber') and $data.get('trackingNumber')!= "")` guard. The `trackingNumber` is passed through `EsputnikOrderJobData` but it is NOT yet passed in `keycrm-shopify-sync.service.ts` for status 10. The queue job adds `pickupAddress` conditionally but no `trackingNumber`. This needs to be extracted from the keyCRM webhook payload.

**Template 07 (CANCELLED) — recommendation block:**
Already present with `#if($data.get('recommendedItems')) #if($data.get('recommendedItems').size() gt 0)` guard. The data key `recommendedItems` is an eSputnik engine variable — this is populated by the eSputnik recommendation engine when the template is triggered, NOT by the app. The `externalItemId` field on each order item is the product ID passed to the engine. No app-side code change is needed to populate recommendations — the engine does it automatically using the items' `externalItemId` values.

**Template 06 (OUT_OF_STOCK) — recommendation block:**
Same structure as 07. Already has recommendation block.

### Pattern 2: keyCRM Status Map

**Current state in `keycrm.ts`:**
```typescript
esputnikStatusMap: {
  3:  "CONFIRMED",
  10: "IN_PROGRESS",
  12: "DELIVERED",
  19: "CANCELLED",
  15: "OUT_OF_STOCK",
} as Record<number, EsputnikOrderStatus>

cancelStatusIds: [18, 19, 20, 15, 13, 14, 16, 17] as number[]
```

**"Відмова від отримання" status:** keyCRM has a distinct status for "refusal to receive" (courier declined, parcel not picked up, etc.). The status ID is unknown — must be looked up in keyCRM admin panel. Once found, add to:
1. `esputnikStatusMap[<new_id>] = "CANCELLED"` — sends the same CANCELLED email
2. `cancelStatusIds` array — triggers Shopify order cancellation with restock

### Pattern 3: keyCRM Order Comment Routing

**Current state in `keycrm-order.service.ts`:**
```typescript
function buildManagerComment(payload: Record<string, any>): string | undefined {
  // Currently puts: cart.note + note_attributes
  // order.note in create.ts currently includes:
  //   - cart.note (user note)
  //   - "Промокод: XYZ"
  //   - "Метод оплати: XYZ"
  //   - "⚠️ Не телефонуйте..." (Viber preference)
}
// No buyer_comment field is populated at all
```

**Required change:** The `KeyCrmOrder` interface already has `buyer_comment?: string` and `manager_comment?: string`. The mapper builds only `manager_comment` from `payload.note` and `note_attributes`. The change is:
- `manager_comment`: payment method + discount code (these come from the Shopify order `note` field, which is already written by `create.ts`)
- `buyer_comment`: the customer-facing note (cart.note from customer, Viber preference)

**Current problem:** `mapShopifyOrderToKeyCrm` receives the Shopify webhook payload (`orders/create` webhook), but the `note` field on that payload already contains the combined string written by `create.ts`. So splitting requires either parsing the note string, or a different approach.

**Practical approach:** The Shopify `orders/create` webhook payload contains `note` (the combined string), `note_attributes` (array of `{name, value}` objects added by the storefront — `_quick_order`, `_customer_name`, `_customer_phone`), and `payment_gateway_names`. The discount code is NOT in webhook payload as a separate field on the order — it's in the `discount_codes` array (`[{code, amount, type}]`). Split:
- `buyer_comment`: extract from `note` the non-technical lines (cart note = first line if present, Viber line)
- `manager_comment`: payment method label + discount code from `payload.discount_codes`

### Pattern 4: Cart Open on Add to Cart

**Current state:** `AddToCartButton.tsx` already calls `openCart()` from `useCartUIStore` on success:
```typescript
const { openCart } = useCartUIStore();
// ...
if (result.success) {
  toast.success(t('addedToCart'));
  openCart();  // This already exists
  onSuccess?.();
}
```

**Conclusion:** The cart already opens immediately on add. This task is to verify this works correctly — if it does, no code change is needed. If the cart is NOT opening, the issue may be in `CartSheetController` not being mounted or a race condition.

### Pattern 5: Checkout — Remove Delivery Section

**Current state:** The checkout has 3 steps: info → delivery → payment. The delivery step is a full page (`/checkout/delivery`) with `DeliveryForm` (Nova Poshta department selector). The CONTEXT says "Remove delivery/shipping section from checkout entirely."

**What this means architecturally:**
- The delivery step page still collects Nova Poshta info — it's used for `shippingAddress` in `createOrder`
- "Remove delivery cost" = remove the display of shipping price from checkout receipts/summaries, NOT remove the delivery step form itself
- The delivery cost row is only in email templates (handled separately), not a prominent checkout UI element
- If the intent is to remove the delivery step completely, that would break order creation (no shipping address). More likely interpretation: remove the delivery COST field from any checkout summary/receipt UI that shows it.

**Receipt delivery info files:** `src/features/checkout/receipt/ui/DeliveryInfo.tsx` — this shows delivery info in the parallel receipt pane.

### Pattern 6: Related Products by SKU

**Current state:** `ProductSessionView.tsx` already implements SKU-based related products as a fallback:
```typescript
if (relatedShopiyProductsData.length < 3) {
  const sku = product.variants.edges[0]?.node?.sku ?? '';
  if (sku.trim()) {
    const skuFillers = await getProductsBySku(sku, product.id, locale, 3 - relatedShopiyProductsData.length);
```

**`getProductsBySku`** queries Shopify Storefront API with `sku:"${sku}" -id:${numericId}`. This is the correct pattern. The CONTEXT says "Link related products using matching SKU" — this is already implemented as a fallback. The task likely means: make SKU matching the PRIMARY source (not just the fallback), or ensure the existing fallback works correctly.

### Pattern 7: Discount Code in Checkout (Frontend)

**Current state:** `DiscountCodeInput.tsx` exists in `src/features/cart/ui/` and is used on the cart page. The discount code flows: cart → `applyDiscountCode()` → Shopify storefront cart → `cart.discountCodes` → used in `createOrder` to compute final price.

**Discount code in Shopify order:** In `create.ts`, applicable discount codes are added to `order.note` as `Промокод: XYZ`. The Shopify `orderCreate` Admin API mutation does NOT support applying discount codes directly to draft orders via this mutation. The discount is already accounted for via price scaling (`discountRatio`).

**Conclusion:** The discount code feature is already implemented in the cart. The CONTEXT item "Apply discount/promo code to order in checkout" means verifying it works — the `DiscountCodeInput` needs to appear in the checkout receipt sidebar or be accessible from the checkout flow, not just the cart page.

### Pattern 8: OrderStatusBadge (Already Complete)

**Current state in `OrderStatusBadge.tsx`:**
```typescript
const isGreen = ['FULFILLED', 'ОБРОБЛЕНО'].includes(upper);
const isRed = ['CANCELLED', 'СКАСОВАНО', 'ВІДМОВА ВІД ОТРИМАННЯ', 'ON_HOLD', 'ОТМЕНЕН'].includes(upper);
```

This already handles all three required statuses. The green/red styling is already in place. This task is effectively already done — just needs verification.

### Pattern 9: Brand Logos (Sanity CMS)

**Current state:** `BrendGrid.tsx` renders brands from Sanity `brandGridBlock` content type. Brand logos are uploaded as assets in Sanity Studio and linked via `brand.asset`. GHOUD and AGL logos need to be added through the Sanity Studio CMS, not code changes. The grid renders up to 5 columns on desktop.

### Pattern 10: Quick Order Phone Default

**Current state in `QuickBuyModal.tsx`:**
```typescript
defaultValues: {
  name: '',
  phone: '+38',  // Currently '+38', NOT '+380'
},
```

**Fix:** Change `phone: '+38'` to `phone: '+380'`. Simple one-line change.

---

## Code Examples

### Velocity: Strip kopecks from price display

```velocity
## Instead of: $!data.get('totalCost') $!data.get('currency')
## Use (Velocity Math tool or intValue):
$!math.floor($!data.get('totalCost')) грн
```

Note: eSputnik Velocity supports the `$math` tool. If not available in the instance, use:
```velocity
#set($cost = $!data.get('totalCost'))
#set($intCost = $cost.intValue())
$intCost грн
```

Both work. `intValue()` is safer as it doesn't require a tool registration.

### Velocity: Add time to date display

```velocity
## Template 01 currently:
$date.format('dd.MM.yyyy', $date.toDate($data.get('date')))

## Change to:
$date.format('dd.MM.yyyy HH:mm', $date.toDate($data.get('date')))
```

### Velocity: Logo with clickable link

```html
<!-- Current (no link): -->
<img src="..." alt="Mio Mio" height="55" style="...">

<!-- Change to: -->
<a href="https://miomio.com.ua" target="_blank" style="display:block">
  <img src="..." alt="Mio Mio" height="55" style="...">
</a>
```

### TypeScript: keyCRM status for Відмова від отримання

In `/Users/mnmac/Development/itali-shop-app/app/shared/config/keycrm.ts`:

```typescript
esputnikStatusMap: {
  3:  "CONFIRMED",
  10: "IN_PROGRESS",
  12: "DELIVERED",
  19: "CANCELLED",
  15: "OUT_OF_STOCK",
  // Add after confirming status ID in keyCRM admin:
  XX: "CANCELLED",  // Відмова від отримання
} as Record<number, EsputnikOrderStatus>,

cancelStatusIds: [18, 19, 20, 15, 13, 14, 16, 17, XX] as number[],
```

### TypeScript: keyCRM comment routing

In `/Users/mnmac/Development/itali-shop-app/app/service/keycrm/keycrm-order.service.ts`:

```typescript
// Extract discount codes from Shopify payload
const discountCodes: string[] = (payload.discount_codes || [])
  .map((d: any) => d.code)
  .filter(Boolean);

// Manager comment: technical/internal data
const managerParts: string[] = [];
if (paymentMethod && paymentMethod !== 'unknown') {
  managerParts.push(`Метод оплати: ${paymentMethod}`);
}
if (discountCodes.length > 0) {
  managerParts.push(`Промокод: ${discountCodes.join(', ')}`);
}
const manager_comment = managerParts.length > 0 ? managerParts.join('\n') : undefined;

// Buyer comment: customer note
const customerNote = payload.note ? extractCustomerNote(payload.note) : undefined;
const buyer_comment = customerNote || undefined;
```

Note: The Shopify `orders/create` webhook has `discount_codes` as a top-level array, separate from `note`. Use this field directly instead of parsing the note string.

### TypeScript: Fix product URL in eSputnik order service

In `/Users/mnmac/Development/itali-shop-app/app/service/esputnik/esputnik-order.service.ts`, line ~195:

```typescript
// Current (incorrect):
const url = productInfo
  ? `https://app.miomio.com.ua/products/${productInfo.handle}`
  : null;

// Fix:
const url = productInfo
  ? `https://miomio.com.ua/products/${productInfo.handle}`
  : null;
```

### TypeScript: Use featured image instead of variant image

In `/Users/mnmac/Development/itali-shop-app/app/service/esputnik/esputnik-order.service.ts`:

```typescript
// Current (uses variant image first):
const imageUrl = productInfo
  ? productInfo.variantImages.get(String(item.variant_id)) ||
    productInfo.featuredImageUrl
  : null;

// Fix (always use featured image):
const imageUrl = productInfo ? productInfo.featuredImageUrl : null;
```

### TypeScript: Pass trackingNumber from keyCRM webhook

In `/Users/mnmac/Development/itali-shop-app/app/service/keycrm/keycrm-shopify-sync.service.ts`:

The keyCRM `order.changed` webhook payload (`context`) currently does not include tracking number. Tracking number is usually in a separate field on the keyCRM order object, not on the status change event. This needs verification — the keyCRM API may require a separate GET call to fetch the order and extract `ttn` (tracking number, Nova Poshta TTN).

Current flow for status 10 (IN_PROGRESS):
```typescript
await esputnikOrderQueue.add("esputnik-order-sync", {
  payload: webhookPayload,
  status: esputnikStatus,
  shop,
  ...(pickupAddress && { pickupAddress }),
  // trackingNumber is NOT added here
});
```

Fix: Extract `ttn` from `context` if present, or call keyCRM `GET /order/:id` to fetch it:
```typescript
const trackingNumber = context.ttn || context.tracking_number || undefined;
// Add to queue:
...(trackingNumber && { trackingNumber }),
```

The `EsputnikOrderJobData` interface already has no `trackingNumber` field — it needs to be added. Then `esputnik-order.worker.ts` needs to pass it to `mapShopifyOrderToEsputnik`.

### React: Quick order phone default

In `/Users/mnmac/Development/nnshop/src/features/product/quick-buy/ui/QuickBuyModal.tsx`:

```typescript
// Current:
defaultValues: {
  name: '',
  phone: '+38',
},

// Fix:
defaultValues: {
  name: '',
  phone: '+380',
},
```

### Translations: Footer phone number

In `/Users/mnmac/Development/nnshop/messages/uk.json` (and `ru.json`, `en.json`):

```json
// Current:
"phone1": "097-217-92-92",

// No change needed — this is already the correct number per CONTEXT (097 217 92 92)
// But verify phone2 and both files match
```

### React: Viber icon (SVG inline)

No Viber icon in lucide-react. Use inline SVG in `Footer.tsx`:

```tsx
const ViberIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M11.4 0C5.1 0 0 5.1 0 11.4c0 3.2 1.3 6 3.4 8.1L1.2 24l4.7-2.1C7.7 23.3 9.5 24 11.4 24 17.7 24 22.8 18.9 22.8 12.6 22.8 5.7 17.7.6 11.4 0z"/>
  </svg>
);
```

Then in Footer, next to phone links:
```tsx
<a href="viber://chat?number=%2B380972179292" className="...">
  <ViberIcon />
</a>
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Velocity integer formatting | Custom regex to strip decimal | `$cost.intValue()` or `$math.floor()` | Velocity built-in, no risk |
| eSputnik recommendations | Custom recommendation fetcher in app | eSputnik engine's built-in `recommendedItems` variable | Already in templates 06/07, engine populates it from `externalItemId` |
| Viber deep link | Custom Viber integration | Standard `viber://chat?number=` URI scheme | Deep link opens Viber on mobile |
| Shopify discount codes | Parse from note string | `payload.discount_codes[]` array on webhook | Direct field, no parsing needed |
| keyCRM TTN | Build new API | Check `context.ttn` or `GET /order/:id` | keyCRM sends TTN on the order object |

---

## Common Pitfalls

### Pitfall 1: eSputnik `$math.floor()` may not be available
**What goes wrong:** Some eSputnik accounts don't have the Math Velocity tool registered.
**Why it happens:** Tool availability is account-dependent configuration.
**How to avoid:** Use `$cost.intValue()` instead — this is a Java method on the Number object, always available.
**Warning signs:** Template renders `$math.floor(1250.00)` literally instead of `1250`.

### Pitfall 2: Velocity `size()` vs `isEmpty()` for recommendation guard
**What goes wrong:** `$data.get('recommendedItems').size() gt 0` fails if `recommendedItems` is null.
**Why it happens:** `size()` on null throws exception.
**How to avoid:** Always double-guard: `#if($data.get('recommendedItems')) #if($data.get('recommendedItems').size() gt 0)` — exactly as implemented in templates 06 and 07 already.

### Pitfall 3: keyCRM webhook `context` vs full order object
**What goes wrong:** Assuming `ttn`/tracking number is in the `status.changed` webhook `context` payload.
**Why it happens:** The webhook only sends `status_id`, not the full order. Tracking number is on the order.
**How to avoid:** For status 10, call `GET /order/:id` to fetch the full keyCRM order and extract `ttn`. Cache the result or handle gracefully.

### Pitfall 4: Duplicate Shopify order note and keyCRM comment confusion
**What goes wrong:** `mapShopifyOrderToKeyCrm` receives `payload.note` which already contains the combined string built by `create.ts` (payment method + discount code + Viber preference). Parsing this is fragile.
**Why it happens:** The combined note was designed for Shopify display, not for structured extraction.
**How to avoid:** Use `payload.discount_codes[]` directly for discount codes, `payload.payment_gateway_names[0]` for payment method — do NOT parse the `payload.note` string. Only put the raw customer note (before any programmatic lines) into `buyer_comment`.

### Pitfall 5: Cart drawer open — `openCart()` already called
**What goes wrong:** Assuming cart doesn't open on add; adding duplicate open logic.
**Why it happens:** Code already calls `openCart()` in `AddToCartButton.tsx`. If cart isn't opening in practice, the issue is likely `CartSheetController` not being in the component tree.
**How to avoid:** First check if the cart opens correctly in local dev. Only add code if it genuinely doesn't work.

### Pitfall 6: Product URL domain in eSputnik service
**What goes wrong:** Product URLs in email link to `app.miomio.com.ua` (the Shopify app subdomain) instead of `miomio.com.ua` (the storefront).
**Why it happens:** Hardcoded wrong domain in `esputnik-order.service.ts`.
**How to avoid:** Fix the URL construction. Consider using an env variable `NEXT_APP_URL` (already used for revalidation) or hardcode `miomio.com.ua`.

### Pitfall 7: "Remove delivery section" ambiguity
**What goes wrong:** Removing the entire delivery checkout step would break order creation (no shipping address collected).
**Why it happens:** CONTEXT says "remove delivery/shipping section" which could mean the step or the cost display.
**How to avoid:** The delivery STEP must stay — it collects Nova Poshta department. Only the delivery COST row in email templates and checkout receipt UI should be removed.

### Pitfall 8: BrandGrid is content-managed
**What goes wrong:** Adding GHOUD/AGL logos in code instead of Sanity CMS.
**Why it happens:** `BrendGrid.tsx` renders from Sanity `brandGridBlock` content.
**How to avoid:** Add brand logos through Sanity Studio. No code changes needed for the brand logo grid.

### Pitfall 9: keyCRM "Відмова від отримання" status ID unknown
**What goes wrong:** Adding a placeholder status ID (e.g., 99) that doesn't match real keyCRM.
**Why it happens:** Status ID must be read from keyCRM admin panel.
**How to avoid:** Add a `// DEPLOYMENT BLOCKER` comment (matching existing pattern for PICKUP_ADDRESS_MAP) documenting that this ID must be confirmed before go-live.

---

## State of the Art

| Area | Current State | What Needs to Change |
|------|---------------|----------------------|
| Email template colors | `#05125C` navy blue for ALL text | Change to `#1a1a1a` for body/heading text; keep `#05125C` for status badges only |
| Price format | `1250.00 UAH` | `1250 грн` (intValue, hardcode грн) |
| Date format | `dd.MM.yyyy` | `dd.MM.yyyy HH:mm` |
| Product URLs | `app.miomio.com.ua/products/...` | `miomio.com.ua/products/...` |
| Product images | Variant image → featured fallback | Featured image always |
| keyCRM comments | All in `manager_comment` | Split: technical → manager, customer note → buyer |
| Discount code in keyCRM | In combined `note` string | Use `payload.discount_codes[]` directly |
| Quick order phone | `+38` default | `+380` default |
| Viber contact | Phone icon only | Phone + Viber icon with `viber://` deep link |
| Order status badge | Already correct | Verify/no change needed |

---

## Open Questions

1. **keyCRM "Відмова від отримання" status ID**
   - What we know: it exists, triggers same flow as CANCELLED
   - What's unclear: the numeric status ID in the specific keyCRM account
   - Recommendation: Add with DEPLOYMENT BLOCKER comment, same as PICKUP_ADDRESS_MAP pattern

2. **keyCRM TTN/tracking number in webhook payload**
   - What we know: the `context` object has `status_id`, `id`, and other fields
   - What's unclear: whether `context.ttn` is populated on the `order.changed` webhook
   - Recommendation: Check keyCRM webhook docs or add a GET call to fetch order by ID for status 10

3. **eSputnik recommendation engine — `recommendedItems` population**
   - What we know: templates 06/07 already have the `recommendedItems` guard and rendering loop
   - What's unclear: whether eSputnik auto-populates `recommendedItems` based on order `items[].externalItemId`, or if an explicit engine request is needed
   - Recommendation: In eSputnik admin, configure recommendation block for the CANCELLED workflow event type. The template code is already correct.

4. **Checkout delivery step removal scope**
   - What we know: CONTEXT says "Remove delivery/shipping section from checkout entirely"
   - What's unclear: whether this means (a) remove delivery COST display only, or (b) remove the entire delivery step
   - Recommendation: Interpret as removing delivery COST from email and checkout receipt summaries only. Confirm with user before removing the delivery step page.

5. **Navigation structure changes**
   - What we know: Navigation is driven by Sanity `mainCategory` content
   - What's unclear: what specific nav changes are required
   - Recommendation: Read current nav in Sanity Studio first; the code change is minimal (content-managed)

---

## Sources

### Primary (HIGH confidence — direct codebase inspection)
- `/Users/mnmac/Development/itali-shop-app/app/service/esputnik/esputnik-order.service.ts` — full mapping and URL logic
- `/Users/mnmac/Development/itali-shop-app/app/service/keycrm/keycrm-order.service.ts` — comment routing, mapping structure
- `/Users/mnmac/Development/itali-shop-app/app/service/keycrm/keycrm-shopify-sync.service.ts` — status map usage, queue job construction
- `/Users/mnmac/Development/itali-shop-app/app/shared/config/keycrm.ts` — `esputnikStatusMap`, `cancelStatusIds`
- `/Users/mnmac/Development/itali-shop-app/app/shared/lib/queue/esputnik-order.queue.ts` — queue job types
- `/Users/mnmac/Development/itali-shop-app/.planning/email/templates/esputnik/` — all 7 Velocity templates inspected
- `/Users/mnmac/Development/nnshop/src/entities/product/ui/AddToCartButton.tsx` — openCart() already called
- `/Users/mnmac/Development/nnshop/src/features/order/ui/OrderStatusBadge.tsx` — status badge already handles Відмова від отримання
- `/Users/mnmac/Development/nnshop/src/features/product/quick-buy/ui/QuickBuyModal.tsx` — phone default '+38'
- `/Users/mnmac/Development/nnshop/src/widgets/footer/ui/Footer.tsx` — phone from translations, no Viber icon
- `/Users/mnmac/Development/nnshop/messages/uk.json` — phone1 = '097-217-92-92' (already correct number)
- `/Users/mnmac/Development/nnshop/src/features/order/api/create.ts` — discount code in note, not in Shopify order mutation
- `/Users/mnmac/Development/nnshop/src/entities/home/ui/BrendGrid/BrendGrid.tsx` — Sanity CMS driven
- `/Users/mnmac/Development/nnshop/src/entities/product/api/getProductsBySku.ts` — SKU-based lookup already exists
- `/Users/mnmac/Development/nnshop/src/features/product/ui/ProductSessionView.tsx` — related products fallback logic

### Secondary (MEDIUM confidence)
- keyCRM API structure for `discount_codes` field on webhook — standard Shopify webhook shape, verified against Shopify webhook docs pattern

### Tertiary (LOW confidence — needs verification)
- keyCRM `context.ttn` presence in `order.changed` webhook — unclear without keyCRM API docs specific to this account
- eSputnik recommendation engine auto-population via `externalItemId` — requires verification in eSputnik admin for this specific account configuration

---

## Metadata

**Confidence breakdown:**
- Email templates: HIGH — all 7 templates read, exact line changes identified
- keyCRM integration: HIGH — all relevant TS files read
- Frontend (nnshop): HIGH — all relevant components read
- eSputnik recommendation engine behavior: LOW — dependent on account configuration
- keyCRM status IDs (Відмова, TTN): LOW — requires admin panel verification

**Research date:** 2026-03-04
**Valid until:** 2026-04-03 (stable codebase, 30 days)
