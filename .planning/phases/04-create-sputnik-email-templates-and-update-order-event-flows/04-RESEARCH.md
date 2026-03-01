# Phase 4: Create Sputnik Email Templates and Update Order Event Flows - Research

**Researched:** 2026-03-01
**Domain:** Esputnik Velocity email templating + Shopify/keyCRM → Esputnik event routing
**Confidence:** HIGH (existing codebase) / MEDIUM (Esputnik API specifics)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Email templates required (7 total)
From PDF requirements (Email section):

1. **замовлення оформлено** (order created/confirmation)
   - Text: "Дякуємо за замовлення. Наші менеджери зв'яжуться з вами найближчим часом для підтвердження замовлення"
   - Contains: order items, totals, delivery + payment method
   - Existing file to update: `to-update/order-confitmatiom.html`

2. **підтверджено** (order confirmed)
   - Text: "Ваше замовлення підтверджене. Очікуйте на повідомлення про відправлення посилки"
   - Contains: order items, totals
   - New template (does not exist yet)

3. **відправлено** (shipped)
   - Text: "Ваше замовлення відправлено. Очікуйте на повідомлення про доставку посилки. Резерв замовлення у відділенні 3 дні з дати прибуття"
   - Contains: order items, tracking info (if available), Nova Poshta branch info
   - Existing file to update: `to-update/shipping-confirmation.html`

4. **виконано** (order completed/purchased)
   - Text: "Дякуємо за покупку…"
   - Contains: order summary
   - Existing file to update: `to-update/order-invoice.html`

5. **готово до самовивозу** (ready for pickup)
   - Text: "Ваше замовлення доставлено в пункт видачі замовлень за адресою [адреса магазину]. Резерв замовлення для отримання 3 дні з дати прибуття"
   - Contains: store address (dynamic), order items
   - New template (does not exist yet)

6. **товару немає в наявності** (out of stock)
   - Text: "На жаль, обраного вами товару немає в наявності. Сподіваємось ви зможете обрати альтернативну модель з наявного асортименту"
   - Contains: out-of-stock item info + product recommendation block
   - New template (does not exist yet)

7. **скасовано** (cancelled)
   - Text: "Ваше замовлення скасовано. Можливо вас можуть зацікавити інші моделі"
   - Contains: cancelled order summary + product recommendation block
   - Existing file to update: `to-update/order-canceled.html`

#### Template design
- Base all templates on `working-template.html` structure and branding
- Header: #1a1a1a background with "ITALI SHOP" text in white
- Body: white background, clean layout
- Footer: dark (#1a1a1a) with support email and unsubscribe link (Esputnik standard)
- Language: 100% Ukrainian

#### Shopify → Esputnik event mapping
- `orders/create` → замовлення оформлено (immediately on order creation)
- Order confirmed (payment captured / status change) → підтверджено
- `orders/fulfilled` (fulfillment created) → відправлено
- `orders/updated` with status=completed → виконано
- Fulfillment at pickup location → готово до самовивозу
- Item marked out of stock during processing → товару немає в наявності
- `orders/cancelled` → скасовано

#### Product recommendation blocks
- Cancelled and out-of-stock emails include a product block ("інші моделі")
- Use Esputnik's built-in recommendation block (Velocity `#foreach` over recommended items)
- Products sourced from Esputnik's product recommendations engine (linked via Shopify product catalog)

#### Pickup store addresses
- 4 store locations (from PDF):
  - Mio Mio — пр Соборний 186, м. Запоріжжя
  - Mio Mio Best — пр Соборний 189, м. Запоріжжя
  - Світлана — пр Соборний 92 (ТР Верже), м. Запоріжжя
  - Світлана — пр Соборний 189, м. Запоріжжя
- One template with dynamic address via `$!data.get('pickupAddress')` variable
- Address passed from Shopify app when triggering the email event

### Claude's Discretion
- Exact spacing, padding, and mobile responsive breakpoints (follow working-template.html patterns)
- Error state handling in templates (missing data fields)
- How to structure the Esputnik API event call from the Shopify app (event name, payload shape)
- Promo code block — deferred (see below)

### Deferred Ideas (OUT OF SCOPE)
- **Promo code generation in 'виконано' email** — PDF says "думати над генерацією промокоду на наступну покупку" (think about it). Defer to a future phase — requires Shopify discount code generation API integration.
</user_constraints>

---

## Summary

Phase 4 has two distinct workstreams: (1) create/rewrite 7 Esputnik Velocity email templates, and (2) wire the Shopify app's event system to send the right Esputnik order status for each lifecycle event.

The `working-template.html` in `.planning/email/templates/` is a fully working Esputnik Velocity template (not Shopify Liquid) and is the design source of truth. The 4 files in `to-update/` are all Shopify Liquid templates (they use `{% %}` syntax) — they are NOT Esputnik templates and cannot be "updated". They must each be completely rebuilt from scratch using `working-template.html` as the structural base, replacing all Shopify Liquid with Esputnik Velocity syntax.

The Shopify app already has a complete Esputnik order integration path: `esputnik-order.queue.ts` → `esputnik-order.service.ts` → `POST /api/v1/orders`. However, this path is currently only triggered by keyCRM webhooks (via `api.keycrm-webhook.ts` → `keycrm-shopify-sync.service.ts`). The Shopify-native `orderSyncQueue` worker (`webhook.worker.ts`) is a stub (TODO). For "замовлення оформлено", the `orders/create` Shopify webhook needs to directly add a job to `esputnikOrderQueue`. The remaining statuses (підтверджено, відправлено, виконано, скасовано) already flow through keyCRM via `esputnikStatusMap` in `keycrm.ts`. Two new statuses — "готово до самовивозу" and "товару немає в наявності" — need new keyCRM status IDs added to the map.

**Primary recommendation:** Treat the email work and the event-routing work as two independent work streams. Build all 7 templates from `working-template.html`. For the routing: wire `orders/create` directly to `esputnikOrderQueue` with status `INITIALIZED`, and extend the `esputnikStatusMap` in `keycrm.ts` with new statuses for pickup-ready and out-of-stock keyCRM IDs.

---

## Standard Stack

### Core (already in project — no new installs needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| BullMQ | existing | Job queue for async Esputnik API calls | Already used for all order/product queues |
| ioredis | existing | Redis client for BullMQ | Already configured |
| Esputnik REST API v1 | `/api/v1/orders` (POST) | Send order events that trigger email workflows | Already implemented in `esputnik-order.service.ts` |

### No New npm Installs Required

All infrastructure (BullMQ, Redis, Shopify webhook auth, Esputnik client) is already in the project.

---

## Architecture Patterns

### Existing Esputnik Order Flow (already working)

```
keyCRM webhook
  → api.keycrm-webhook.ts
  → handleKeyCrmOrderStatusChange()
  → esputnikOrderQueue.add()
  → processEsputnikOrderTask()
  → mapShopifyOrderToEsputnik() [fetches product info from Shopify]
  → sendOrderToEsputnik() [POST /api/v1/orders]
  → Esputnik generates orderINITIALIZED / orderIN_PROGRESS / orderDELIVERED / orderCANCELLED events
  → Esputnik workflows pick up events → send email using template
```

### Gap 1: orders/create → замовлення оформлено (NOT wired yet)

The `orders/create` webhook fires → `getSyncQueue("ORDERS_CREATE")` → `orderSyncQueue.add()` → `webhook.worker.ts` which is a stub. Esputnik never gets the "INITIALIZED" event from Shopify order creation.

**Fix:** In `webhooks.orders.create.tsx` action, ALSO add a job to `esputnikOrderQueue` with status `"INITIALIZED"`. The Shopify webhook payload is already in the right shape for `mapShopifyOrderToEsputnik()`.

### Gap 2: New eSputnik statuses needed

The current `EsputnikOrderStatus` type only has:
```typescript
type EsputnikOrderStatus = "INITIALIZED" | "IN_PROGRESS" | "DELIVERED" | "CANCELLED";
```

The eSputnik `/api/v1/orders` endpoint accepts any status string. New statuses needed:
- `"READY_FOR_PICKUP"` — triggers "готово до самовивозу" workflow
- `"OUT_OF_STOCK"` — triggers "товару немає в наявності" workflow

These are custom status strings that will create custom event types in Esputnik (`orderREADY_FOR_PICKUP`, `orderOUT_OF_STOCK`).

### Gap 3: pickupAddress field

For "готово до самовивозу", the template needs `$!data.get('pickupAddress')`. This field must be added to the `EsputnikOrder` interface and populated when the READY_FOR_PICKUP event fires. The keyCRM webhook context will need to include the store location, OR the keyCRM status ID itself will imply a store.

### Recommended Project Structure

```
app/
├── service/esputnik/
│   ├── esputnik-order.service.ts    # Existing — add pickupAddress field + new statuses to interface
│   └── esputnik-order.worker.ts     # Existing — no changes needed
├── shared/
│   ├── config/
│   │   └── keycrm.ts                # Add new keyCRM status IDs to esputnikStatusMap
│   └── lib/queue/
│       └── esputnik-order.queue.ts  # Add new status strings to EsputnikOrderStatus union
└── routes/
    └── webhooks.orders.create.tsx   # Wire esputnikOrderQueue.add() for INITIALIZED

.planning/email/templates/
├── working-template.html            # Base — do not modify, reference only
├── to-update/                       # OLD Shopify Liquid files — replaced by new files
└── esputnik/                        # NEW directory — all 7 final templates
    ├── 01-zamovlennya-oformleno.html
    ├── 02-pidtverdzheno.html
    ├── 03-vidpravleno.html
    ├── 04-vykonano.html
    ├── 05-hotovo-do-samovyvOzu.html
    ├── 06-tovaru-nemaie-v-nayavnosti.html
    └── 07-skasovano.html
```

### Pattern 1: Esputnik Velocity Template Structure

All 7 templates follow this exact structure from `working-template.html`:

```html
<!-- Source: .planning/email/templates/working-template.html -->
<html lang="uk">
  <head>
    <!-- charset, viewport, email client resets, inline CSS -->
    <style>
      body { margin: 0; padding: 0; background-color: #f4f4f4; font-family: Arial, Helvetica, sans-serif; }
      .wrapper { max-width: 600px; margin: 0 auto; }
      /* Mobile: @media only screen and (max-width: 620px) */
    </style>
  </head>
  <body style="background-color:#f4f4f4">
    <table width="100%" cellspacing="0" cellpadding="0">
      <tr><td align="center" style="padding:20px 10px">
        <table width="600" class="wrapper" style="background-color:#ffffff; border-radius:8px; overflow:hidden">
          <!-- HEADER: dark bar -->
          <tr>
            <td style="background-color:#1a1a1a; padding:30px 40px; text-align:center">
              <h1 style="margin:0; color:#ffffff; font-size:22px; font-weight:600; letter-spacing:1px">ITALI SHOP</h1>
            </td>
          </tr>
          <!-- TITLE ROW: status-specific heading + order number -->
          <!-- CUSTOMER INFO ROW -->
          <!-- DIVIDER -->
          <!-- ITEMS LOOP: #foreach($item in $data.get('items')) -->
          <!-- TOTALS SUMMARY -->
          <!-- DELIVERY + PAYMENT (template-specific) -->
          <!-- FOOTER: dark bar with support email + unsubscribe -->
          <tr>
            <td style="background-color:#1a1a1a; padding:25px 40px; text-align:center">
              <p style="margin:0 0 8px; font-size:14px; color:#ffffff">Є питання? Напишіть нам</p>
              <a href="mailto:support@italishop.com" style="font-size:13px; color:#cccccc; text-decoration:underline">support@italishop.com</a>
              <p style="margin:15px 0 0; font-size:12px; color:#888888">ITALI SHOP © 2026</p>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
    <!-- UNSUBSCRIBE: mandatory Esputnik block OUTSIDE main wrapper -->
    <table align="center" cellpadding="0" cellspacing="0" width="600" class="es-content-body" ...>
      <tr><td ...>
        <p style="color:grey">
          <a id="unsubscribe" href="https://esputnik.com/unsubscribe" style="font-size:14px">Unsubscribe</a>
        </p>
      </td></tr>
    </table>
  </body>
</html>
```

### Pattern 2: Esputnik Velocity Syntax (from working-template.html)

```html
<!-- Access order-level scalar field -->
$!data.get('externalOrderId')
$!data.get('firstName') $!data.get('lastName')
$!data.get('totalCost') $!data.get('currency')
$!data.get('deliveryMethod')
$!data.get('paymentMethod')
$!data.get('deliveryAddress')
$!data.get('pickupAddress')      <!-- new field for pickup template -->
$!data.get('trackingNumber')     <!-- new field for shipped template -->

<!-- Loop over items array -->
#foreach($item in $data.get('items'))
  $!item.get('name')
  $!item.get('quantity')
  $!item.get('cost')
  $!item.get('imageUrl')
  $!item.get('url')
#end

<!-- Conditional rendering (silent null) -->
#if($!data.get('discount'))
  <td>-$!data.get('discount') $!data.get('currency')</td>
#end

#if($!data.get('deliveryMethod'))
  <p>$!data.get('deliveryMethod')</p>
#end

<!-- Product recommendations block (cancelled + out-of-stock templates) -->
#foreach($rec in $data.get('recommendedItems'))
  $!rec.get('name')
  $!rec.get('url')
  $!rec.get('imageUrl')
#end
```

**Critical:** Use `$!` (silent reference) throughout — `$!data.get('field')` outputs empty string when field is null/missing, whereas `$data.get('field')` outputs the literal variable name. The `working-template.html` consistently uses `$!` everywhere.

### Pattern 3: Esputnik API — Order Status Event Trigger

How the app sends order data to Esputnik (existing pattern, `esputnik-order.service.ts`):

```typescript
// Source: app/service/esputnik/esputnik-order.service.ts
await fetch(`${ESPUTNIK_CONFIG.baseUrl}/orders`, {  // POST https://esputnik.com/api/v1/orders
  method: "POST",
  headers: {
    Authorization: ESPUTNIK_CONFIG.authHeader,       // Basic base64(login:key)
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    orders: [{
      externalOrderId: "#1234",
      totalCost: 2500,
      status: "INITIALIZED",     // → triggers orderINITIALIZED event in Esputnik
      date: "2026-03-01T10:00:00Z",
      currency: "UAH",
      email: "[email protected]",
      firstName: "Іван",
      lastName: "Шевченко",
      items: [{
        externalItemId: "12345",
        name: "Чоловічий рюкзак - синій",
        quantity: 1,
        cost: 2500,
        url: "https://app.miomio.com.ua/products/ryukzak-cholovichiy-siniy",
        imageUrl: "https://cdn.shopify.com/...",
      }],
      shipping: 60,
      discount: 0,
      deliveryMethod: "Нова Пошта",
      paymentMethod: "Готівка",
      deliveryAddress: "м. Запоріжжя, вул. Перемоги, 1",
      // New fields for specific templates:
      pickupAddress: "пр Соборний 186, м. Запоріжжя",   // READY_FOR_PICKUP
      trackingNumber: "59000000000000",                   // IN_PROGRESS
    }]
  }),
});
// Response 200 → Esputnik creates event "orderINITIALIZED"
// Esputnik workflow triggered → sends email using template linked to that event
```

### Pattern 4: Wiring orders/create to Esputnik (new code needed)

```typescript
// Source: app/routes/webhooks.orders.create.tsx — current state (stub)
// Current: only adds to orderSyncQueue (stub worker, does nothing for Esputnik)
// Fix: also add to esputnikOrderQueue

import { esputnikOrderQueue } from "@shared/lib/queue/esputnik-order.queue";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, shop, topic } = await authenticate.webhook(request);

  // Existing: add to sync queue (for KeyCRM)
  const queue = getSyncQueue(topic);
  if (queue) await queue.add(topic, { shop, topic, payload });

  // NEW: add to esputnik queue for "замовлення оформлено" email
  await esputnikOrderQueue.add("esputnik-order-sync", {
    payload,
    status: "INITIALIZED",
    shop,
  });

  return new Response(null, { status: 200 });
};
```

### Pattern 5: Extending keyCRM Status Map for New Statuses

```typescript
// Source: app/shared/config/keycrm.ts
export const KEYCRM_CONFIG = {
  // ...existing...
  esputnikStatusMap: {
    3:  "INITIALIZED",        // Підтверджено → підтверджено email
    10: "IN_PROGRESS",        // Відправлено → відправлено email
    12: "DELIVERED",          // Виконано → виконано email
    19: "CANCELLED",          // Скасовано → скасовано email
    15: "CANCELLED",          // Немає в наявності → treated as cancelled currently

    // NEW — add when keyCRM status IDs for pickup/out-of-stock are known:
    // XX: "READY_FOR_PICKUP",  // keyCRM status for "готово до самовивозу"
    // YY: "OUT_OF_STOCK",      // keyCRM status for "товару немає в наявності"
  }
};

// Also extend EsputnikOrderStatus union type in esputnik-order.queue.ts:
export type EsputnikOrderStatus =
  | "INITIALIZED"
  | "IN_PROGRESS"
  | "DELIVERED"
  | "CANCELLED"
  | "READY_FOR_PICKUP"   // NEW
  | "OUT_OF_STOCK";      // NEW
```

### Anti-Patterns to Avoid

- **Using Shopify Liquid syntax in Esputnik templates:** `{% %}` and `{{ }}` do not work in Esputnik. All dynamic content uses `$!data.get('field')` and `#foreach`.
- **Using `$data.get()` without `!`:** Without the silent operator, missing fields render as literal text like `$data.get('trackingNumber')` in the email.
- **Putting the unsubscribe block inside the main wrapper table:** The `<a id="unsubscribe">` block must be OUTSIDE the main wrapper table, in its own separate table after `</body>`-wrapper. This is how Esputnik's editor injects it.
- **Forgetting to set up Esputnik workflows in the UI:** Sending an order to the API creates an event, but the email is only sent if a workflow in Esputnik's UI is configured to trigger on that event type and send that template. Template creation alone is not enough.
- **Double-sending "INITIALIZED" for orders/create:** The `orders/create` webhook is fired AND keyCRM status 3 ("Підтверджено") maps to `"INITIALIZED"`. These are different emails: order creation (замовлення оформлено) vs. confirmation (підтверджено). They should be separate Esputnik status strings.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Email delivery | Custom SMTP integration | Esputnik `/api/v1/orders` endpoint | Already integrated, handles delivery, tracking, unsubscribes |
| Template variable interpolation | String replacement in TS | Esputnik Velocity engine | Server-side rendering of `$!data.get()` is handled by Esputnik, not the app |
| Mobile-responsive email CSS | Custom media query framework | Pattern from `working-template.html` | Already has `@media only screen and (max-width: 620px)` rules |
| Retry logic for Esputnik API | Custom retry loop | BullMQ `attempts: 3, backoff: exponential` | Already configured in `esputnik-order.queue.ts` |
| Product recommendations | Custom algorithm | Esputnik recommendation engine | Velocity `#foreach($rec in $data.get('recommendedItems'))` — sourced from Esputnik's engine |

**Key insight:** The app's role is only to send structured JSON to Esputnik's `/api/v1/orders` endpoint. Esputnik handles rendering, delivery, unsubscribes, and personalization. The templates live in Esputnik's template editor (uploaded via the UI or API), not in the app codebase.

---

## Common Pitfalls

### Pitfall 1: Conflating "INITIALIZED" for two different templates
**What goes wrong:** keyCRM status 3 ("Підтверджено") currently maps to `"INITIALIZED"` in `esputnikStatusMap`. If `orders/create` also sends `"INITIALIZED"`, the customer receives the same template twice for two different lifecycle events.
**Why it happens:** The current `esputnikStatusMap` was designed for the confirmed email, but `INITIALIZED` logically means "order just created" in eSputnik's system.
**How to avoid:** Use `"INITIALIZED"` only for `orders/create` (замовлення оформлено). Change keyCRM status 3 to a new status string like `"CONFIRMED"` that triggers the "підтверджено" template via a separate Esputnik workflow.
**Warning signs:** Customer receives two emails immediately after placing an order.

### Pitfall 2: Esputnik workflow setup is required — it's a manual step
**What goes wrong:** Templates are created and API calls are sending order events, but no emails are delivered.
**Why it happens:** Esputnik requires a "Workflow" to be configured in its UI that: (a) triggers on a specific event type (e.g., `orderINITIALIZED`), (b) uses a "Get order" task block to load order data, (c) sends the correct template.
**How to avoid:** Document the required workflows as a delivery checklist. For each of the 7 templates, a corresponding workflow must be created in Esputnik → Automation → Workflows.
**Warning signs:** Test API call returns 200 OK but no email arrives.

### Pitfall 3: pickupAddress field not available from Shopify payload
**What goes wrong:** The pickup-ready email needs `pickupAddress`, but this is not in the standard Shopify order payload. The Shopify payload doesn't know which physical store the order is at.
**Why it happens:** Pickup store assignment happens in keyCRM, not Shopify. The keyCRM webhook only sends `status_id`, not the store address.
**How to avoid:** The keyCRM webhook `context` object may contain additional fields. If the store location is identifiable from keyCRM context (e.g., a `source_id` or custom field), map it to the address. Alternatively, use a static mapping: keyCRM status ID → store address. This must be clarified during planning.
**Warning signs:** `$!data.get('pickupAddress')` renders as empty in the template.

### Pitfall 4: trackingNumber not available from keyCRM context
**What goes wrong:** The shipped email should include a tracking number, but keyCRM's webhook context only contains `status_id`.
**Why it happens:** Tracking numbers in keyCRM are stored per-shipment. The webhook payload in the current implementation only fetches the Shopify order (not the keyCRM shipment details).
**How to avoid:** In `handleKeyCrmOrderStatusChange()`, if status triggers `"IN_PROGRESS"`, optionally call the keyCRM API to fetch the shipment tracking number. This is an enhancement — make `trackingNumber` optional in the template using `#if($!data.get('trackingNumber'))`.
**Warning signs:** Tracking section renders as empty — acceptable if guarded with `#if`.

### Pitfall 5: Max 20KB event payload
**What goes wrong:** Esputnik's `/api/v1/event` endpoint has a 20KB limit. Orders with many items or large image URLs may exceed this.
**Why it happens:** The order payload includes imageUrl per item.
**How to avoid:** Use the `/api/v1/orders` endpoint (not `/api/v1/event`). The orders endpoint has higher limits. The current implementation already uses `/api/v1/orders` — do not change this.
**Warning signs:** HTTP 413 or truncation errors from Esputnik.

---

## Code Examples

### Template: Items Loop (from working-template.html)

```html
<!-- Source: .planning/email/templates/working-template.html lines 89-124 -->
#foreach($item in $data.get('items'))
<table cellpadding="0" cellspacing="0" width="100%">
  <tr>
    <td style="padding:12px 0; border-bottom:1px solid #f0f0f0">
      <table cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td width="100" valign="top" class="item-image" style="padding-right:15px">
            #if($!item.get('imageUrl'))
            <a href="$!item.get('url')" target="_blank">
              <img alt="$!item.get('name')" src="$!item.get('imageUrl')" width="100"
                   style="display:block; border-radius:4px; object-fit:cover">
            </a>
            #else
            <div style="width:100px; height:100px; background-color:#f0f0f0; border-radius:4px"></div>
            #end
          </td>
          <td valign="top" class="item-details" style="font-size:14px; color:#333333">
            <a href="$!item.get('url')" target="_blank"
               style="text-decoration:none; font-weight:600; font-size:15px; color:#1a1a1a">
              $!item.get('name')
            </a>
            <p style="margin:8px 0 0; color:#666666">К-сть: $!item.get('quantity')</p>
            <p style="color:#1a1a1a; margin:4px 0 0; font-weight:600; font-size:16px">
              $!item.get('cost') $!data.get('currency')
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
#end
```

### Template: Conditionally rendered section (tracking number for shipped)

```html
<!-- Pattern: wrap optional fields with #if to avoid empty rows -->
#if($!data.get('trackingNumber'))
<tr>
  <td style="padding:20px 40px">
    <h3 style="font-size:14px; color:#1a1a1a; text-transform:uppercase; margin:0 0 8px">
      Трекінг посилки
    </h3>
    <p style="margin:0; font-size:14px; color:#666666">
      $!data.get('trackingNumber')
    </p>
  </td>
</tr>
#end
```

### Template: Product recommendation block (cancelled + out-of-stock)

```html
<!-- Velocity foreach over recommended items from Esputnik engine -->
#if($data.get('recommendedItems') && $data.get('recommendedItems').size() > 0)
<tr>
  <td style="padding:20px 40px">
    <h3 style="font-size:16px; color:#1a1a1a; text-transform:uppercase; margin:0 0 16px">
      Можливо вас зацікавить
    </h3>
    <table cellpadding="0" cellspacing="0" width="100%">
      #foreach($rec in $data.get('recommendedItems'))
      <tr>
        <td style="padding:8px 0; border-bottom:1px solid #f0f0f0">
          <a href="$!rec.get('url')" target="_blank" style="text-decoration:none; color:#1a1a1a">
            $!rec.get('name')
          </a>
        </td>
      </tr>
      #end
    </table>
  </td>
</tr>
#end
```

### Wiring orders/create webhook to Esputnik

```typescript
// Source pattern: app/routes/webhooks.orders.create.tsx
import { esputnikOrderQueue } from "@shared/lib/queue/esputnik-order.queue";
import { getSyncQueue } from "@/service/sync/sync.registry";
import { authenticate } from "@/shopify.server";
import { ActionFunctionArgs } from "react-router";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, shop, topic } = await authenticate.webhook(request);

  // Existing sync queue (keyCRM etc.)
  const queue = getSyncQueue(topic);
  if (queue) {
    await queue.add(topic, { shop, topic, payload });
  }

  // NEW: send "замовлення оформлено" event to Esputnik immediately
  await esputnikOrderQueue.add("esputnik-order-sync", {
    payload,
    status: "INITIALIZED",
    shop,
  });

  return new Response(null, { status: 200 });
};
```

### EsputnikOrder interface extension (for new fields)

```typescript
// Source: app/service/esputnik/esputnik-order.service.ts — extend interface
interface EsputnikOrder {
  externalOrderId: string;
  totalCost: number;
  status: EsputnikOrderStatus;
  date: string;
  currency: string;
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  shipping?: number;
  discount?: number;
  deliveryMethod?: string;
  paymentMethod?: string;
  deliveryAddress?: string;
  pickupAddress?: string;       // NEW — for "готово до самовивозу"
  trackingNumber?: string;      // NEW — for "відправлено"
  items: EsputnikOrderItem[];
}
```

---

## Critical Architecture Finding: Current Status Map Conflict

The current `KEYCRM_CONFIG.esputnikStatusMap` has:
```
3: "INITIALIZED"  // Підтверджено
```

But `"INITIALIZED"` will now ALSO be used for `orders/create` (замовлення оформлено). These are TWO DIFFERENT emails. This conflict must be resolved:

**Option A (recommended):** Add `"CONFIRMED"` as a new status string. Remap keyCRM status 3 from `"INITIALIZED"` to `"CONFIRMED"`. Create a new Esputnik workflow for `orderCONFIRMED` → підтверджено template. Keep `"INITIALIZED"` only for `orders/create`.

**Option B:** Do not change the current `keyCRM status 3 → INITIALIZED` mapping; instead, give `orders/create` a new status like `"ORDER_CREATED"`. Less semantically correct but avoids changing existing behavior.

Either way, the planner must decide which option before task decomposition.

---

## State of the Art

| Old Approach | Current Approach | Status |
|--------------|------------------|--------|
| `to-update/` Shopify Liquid templates | Esputnik Velocity templates based on `working-template.html` | Must rebuild completely |
| Single `INITIALIZED` status | Separate statuses for "created" vs "confirmed" | Requires code change |
| keyCRM-only Esputnik trigger | keyCRM + direct Shopify webhook trigger for order creation | Requires code change |

**Templates that need complete rewrite (not "update"):**
- `to-update/order-confitmatiom.html` — this is Shopify Liquid, not Esputnik Velocity
- `to-update/order-canceled.html` — Shopify Liquid
- `to-update/shipping-confirmation.html` — Shopify Liquid
- `to-update/order-invoice.html` — Shopify Liquid

All four must be rebuilt as Esputnik Velocity from `working-template.html`.

---

## Open Questions

1. **INITIALIZED status conflict: Option A vs B?**
   - What we know: `keyCRM status 3` currently maps to `"INITIALIZED"`. `orders/create` will also need `"INITIALIZED"` or a new status.
   - What's unclear: Which keyCRM status ID represents "Підтверджено" in the actual keyCRM instance? Is it definitely ID 3?
   - Recommendation: During Wave 0, verify the keyCRM status ID for "Підтверджено" in the live keyCRM instance, then use Option A (add `"CONFIRMED"` status).

2. **keyCRM status IDs for pickup-ready and out-of-stock?**
   - What we know: Current `esputnikStatusMap` has status 15 → `"CANCELLED"` (Немає в наявності). This is wrong if we want a distinct "out of stock" email.
   - What's unclear: What are the keyCRM status IDs for "готово до самовивозу" and "товару немає в наявності" in the live system?
   - Recommendation: Query the keyCRM API or check the admin panel for the status list. Map accordingly.

3. **pickupAddress — how does the keyCRM webhook know which store?**
   - What we know: The keyCRM `context` object includes `source_id`, `status_id`, and other fields (see `KeyCrmWebhookPayload` interface).
   - What's unclear: Is the pickup store location available in keyCRM context, or must it be inferred from the order's shipping address?
   - Recommendation: Check if `context` includes a warehouse/location field. If not, use a static map of keyCRM status IDs → store addresses (since there are only 4 stores, this is feasible).

4. **Where do Esputnik templates live after creation?**
   - What we know: Templates are HTML files. Esputnik requires them to be uploaded into its template library via the UI (Messages → Email).
   - What's unclear: Is there an API for template upload, or is the UI the only path?
   - Recommendation: Plan for manual upload step. The `.planning/email/templates/esputnik/` directory is the source of truth for the HTML files; upload via Esputnik UI is a deployment step, not a code step.

5. **Esputnik workflow setup — is this in scope for Phase 4?**
   - What we know: Sending orders to the API is only half the work; Esputnik workflows must also be configured in the UI.
   - What's unclear: Who configures the workflows? Can they be scripted/API-driven?
   - Recommendation: Include workflow setup instructions as a delivery checklist item in the verification step, not as code tasks. Manual configuration in Esputnik UI.

---

## Sources

### Primary (HIGH confidence)
- Codebase: `app/service/esputnik/esputnik-order.service.ts` — full implementation of order-to-Esputnik mapping
- Codebase: `app/shared/config/keycrm.ts` — `esputnikStatusMap`, current status routing
- Codebase: `app/service/esputnik/esputnik-order.worker.ts` + `esputnik-order.queue.ts` — queue patterns
- Codebase: `app/routes/webhooks.orders.create.tsx` — current webhook stub
- Codebase: `app/routes/api.keycrm-webhook.ts` — keyCRM webhook entry point
- Codebase: `.planning/email/templates/working-template.html` — definitive Esputnik Velocity template pattern

### Secondary (MEDIUM confidence)
- https://docs.esputnik.com/docs/add-orders-api-method-for-order-transferring — order status event names (`orderINITIALIZED` etc.), workflow setup
- https://docs.yespo.io/docs/orders-automation — workflow trigger documentation
- https://docs.esputnik.com/reference/how-to-use-the-generate-event-api-resource — event API format

### Tertiary (LOW confidence — verify with Esputnik UI or support)
- Exact Velocity variable names available when using "Get order" workflow block
- Whether custom status strings beyond the 4 standard ones (INITIALIZED/IN_PROGRESS/DELIVERED/CANCELLED) trigger custom events
- Template upload API availability

---

## Metadata

**Confidence breakdown:**
- Template structure and Velocity syntax: HIGH — verified directly from `working-template.html` in the codebase
- Esputnik API endpoint and order format: HIGH — verified from `esputnik-order.service.ts`
- Order event routing gaps: HIGH — verified from reading all webhook routes and queue wiring
- New status strings behavior: MEDIUM — documented by Esputnik, but not verified against live instance
- keyCRM status IDs for new statuses: LOW — IDs unknown, must check live keyCRM instance

**Research date:** 2026-03-01
**Valid until:** 2026-04-01 (stable infrastructure — 30 days)
