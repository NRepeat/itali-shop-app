# Phase 4: Create Sputnik Email Templates and Update Order Event Flows - Context

**Gathered:** 2026-03-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Create 7 Esputnik transactional email templates covering all order lifecycle events, and update the Shopify app's order event flows to trigger each email at the correct stage. All content in Ukrainian. Templates must be compatible with Esputnik's Velocity templating engine (`$!data.get(...)`, `#foreach`, `#if` syntax). Base visual design from `working-template.html`.

</domain>

<decisions>
## Implementation Decisions

### Email templates required (7 total)
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

### Template design
- Base all templates on `working-template.html` structure and branding
- Header: #1a1a1a background with "ITALI SHOP" text in white
- Body: white background, clean layout
- Footer: dark (#1a1a1a) with support email and unsubscribe link (Esputnik standard)
- Language: 100% Ukrainian

### Shopify → Esputnik event mapping
- `orders/create` → замовлення оформлено (immediately on order creation)
- Order confirmed (payment captured / status change) → підтверджено
- `orders/fulfilled` (fulfillment created) → відправлено
- `orders/updated` with status=completed → виконано
- Fulfillment at pickup location → готово до самовивозу
- Item marked out of stock during processing → товару немає в наявності
- `orders/cancelled` → скасовано

### Product recommendation blocks
- Cancelled and out-of-stock emails include a product block ("інші моделі")
- Use Esputnik's built-in recommendation block (Velocity `#foreach` over recommended items)
- Products sourced from Esputnik's product recommendations engine (linked via Shopify product catalog)

### Pickup store addresses
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

</decisions>

<specifics>
## Specific Ideas

- All templates must use Esputnik Velocity syntax (same as working-template.html) — NOT Shopify Liquid
- "Резерв замовлення у відділенні 3 дні з дати прибуття" must appear in both shipped and pickup emails
- The unsubscribe link must be the Esputnik standard `<a id="unsubscribe" href="https://esputnik.com/unsubscribe">` (already in working-template.html)
- Cancelled/out-of-stock product blocks mirror "пропозиції зі сторінки товару" — related products

</specifics>

<deferred>
## Deferred Ideas

- **Promo code generation in 'виконано' email** — PDF says "думати над генерацією промокоду на наступну покупку" (think about it). Defer to a future phase — requires Shopify discount code generation API integration.

</deferred>

---

*Phase: 04-create-sputnik-email-templates-and-update-order-event-flows*
*Context gathered: 2026-03-01*
