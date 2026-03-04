# Phase 5: Email improvements and frontend fixes - Context

**Gathered:** 2026-03-04
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers three categories of improvements:
1. **Email templates** — Visual, data, and content fixes across all eSputnik order email templates
2. **keyCRM integration** — New status handling (Відмова від отримання), tracking code, order comment routing, discount code passthrough
3. **Frontend (nnshop storefront)** — Checkout, cart, account page, navigation, and UX fixes

</domain>

<decisions>
## Implementation Decisions

### Email — Visual & Formatting
- Change all non-status text/colors from blue to black; order status badge remains blue
- Remove kopecks from all price displays (show whole hryvnias only)
- "UAH" label → "грн"
- Show order creation time in email (not just date)
- Remove delivery cost calculation row from emails
- Hide discount/знижка row entirely if no discount on the order
- Remove duplicate "Оплата" label (appears twice in current templates)

### Email — Content & Structure
- Move "Наші менеджери…" text to top of email, directly under "Дякуємо за замовлення"
- Add order creation time to email header/order info block

### Email — Media & Links
- Fix product URLs in line items (currently incorrect)
- Product images: use main/featured product photo (not variant image)
- Restore clickable link on logo (logo → site homepage)
- Change sender display name to "Міо Міо" + add Mio Mio logo to email header

### Email — Template-Specific: Відправлено (IN_PROGRESS)
- Add tracking code block to the shipped email template
- Tracking number passed as param from keyCRM webhook (already implemented via `trackingNumber` field)

### Email — Template-Specific: Скасовано (CANCELLED)
- Add recommended products block ("Вам може сподобатись")
- Source: related products from eSputnik recommendation engine (linked via `externalItemId`)

### keyCRM — New Status: Відмова від отримання
- Add new keyCRM status ID for "Відмова від отримання" to the status map
- Duplicate Скасовано logic: send CANCELLED eSputnik event + cancel Shopify order + restock
- Status ID to be determined from keyCRM admin panel

### keyCRM — Order Comments Routing
- Technical info (payment method, discount code) → move to "коментар для менеджера"
- Customer-visible info → move to "коментар клієнта"

### keyCRM — Tracking Code
- Verify that tracking code is being correctly passed and stored when order is shipped

### keyCRM — Discount Code (промокод)
- Investigate and implement discount code passthrough from Shopify order to keyCRM order notes

### Frontend — Checkout
- Remove delivery/shipping section from checkout entirely (no delivery cost shown or calculated)

### Frontend — Cart
- Show cart sidebar/drawer immediately when product is added to cart

### Frontend — Account Page (Особистий кабінет)
- Status "Оброблено" badge → green color
- Status "Скасовано" badge → red color
- Status "Відмова від отримання" badge → red color
- Handle "Відмова від отримання" status update display

### Frontend — Quick Order (Швидке замовлення)
- Default phone country code to Ukraine (+380)

### Frontend — Related Products
- Link related products using matching SKU (not product ID)

### Frontend — Discount Application
- Apply discount/promo code to order in checkout

### Frontend — Contact Info
- Change phone number to 097 217 92 92
- Add Viber icon/link next to phone number

### Frontend — Navigation
- Menu navigation updates (structure TBD — review current menu in code)

### Frontend — Brand Logos
- Add logos for GHOUD and AGL brands to brand logo section

### Frontend — "Стежити за ціною" (Price Watch)
- Test and verify "watch price" feature works correctly

### Claude's Discretion
- Exact eSputnik recommendation engine API call structure for related products
- Animation/transition for cart drawer appearing
- Exact navigation structure changes (read current code first)
- Viber icon sourcing (SVG or icon font)

</decisions>

<specifics>
## Specific Ideas

- Related products in Скасовано email should use eSputnik's "вам може сподобатись" recommendation block — same as what may already exist in template 06/07
- The tracking code in the "Відправлено" email should only render if tracking number is present (already guarded with `#if` in template 03)
- Frontend: related products linked by same SKU — likely means looking up products where any variant SKU matches the current product's SKU

</specifics>

<deferred>
## Deferred Ideas

- None — all items listed are within phase scope

</deferred>

---

*Phase: 05-email-improvements-and-frontend-fixes*
*Context gathered: 2026-03-04*
