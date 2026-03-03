/**
 * Test script: send mock orders for ALL eSputnik order event types
 *
 * INITIALIZED, IN_PROGRESS, DELIVERED, CANCELLED → Orders API (POST /v1/orders)
 * CONFIRMED, READY_FOR_PICKUP, OUT_OF_STOCK      → Events API (POST /v1/event)
 *
 * Run: dotenv -e .env tsx scripts/test-esputnik-order-events.ts
 * Optional: TEST_EMAIL=you@example.com dotenv -e .env tsx scripts/test-esputnik-order-events.ts
 */

const BASE_URL = "https://esputnik.com/api/v1";
const auth = Buffer.from(
  `${process.env.ESPUTNIK_API_LOGIN}:${process.env.ESPUTNIK_API_KEY}`
).toString("base64");
const AUTH_HEADER = `Basic ${auth}`;

type OrderStatus =
  | "INITIALIZED"
  | "CONFIRMED"
  | "IN_PROGRESS"
  | "DELIVERED"
  | "READY_FOR_PICKUP"
  | "OUT_OF_STOCK"
  | "CANCELLED";

const STATUS_LABELS: Record<OrderStatus, string> = {
  INITIALIZED:     "замовлення оформлено",
  CONFIRMED:       "підтверджено",
  IN_PROGRESS:     "відправлено",
  DELIVERED:       "виконано",
  READY_FOR_PICKUP:"готово до самовивозу",
  OUT_OF_STOCK:    "товару немає в наявності",
  CANCELLED:       "скасовано",
};

// Standard eSputnik order statuses → Orders API
const ORDERS_API_STATUSES: OrderStatus[] = ["INITIALIZED", "IN_PROGRESS", "DELIVERED", "CANCELLED"];

// Custom events → Events API
const EVENTS_API_STATUSES: OrderStatus[] = ["CONFIRMED", "READY_FOR_PICKUP", "OUT_OF_STOCK"];

const STATUSES: OrderStatus[] = [
  "INITIALIZED", "CONFIRMED", "IN_PROGRESS", "DELIVERED",
  "READY_FOR_PICKUP", "OUT_OF_STOCK", "CANCELLED",
];

const TEST_ITEMS = [
  {
    externalItemId: "123456",
    name: "Кросівки Nike Air Max - Чорний / 42",
    quantity: 1,
    cost: 2399.0,
    url: "https://app.miomio.com.ua/products/krosivky-nike-air-max",
    imageUrl: "https://cdn.shopify.com/s/files/1/0000/0000/products/test.jpg",
  },
];

function buildOrderPayload(status: OrderStatus, email: string) {
  const orderId = `#TEST-${Date.now()}`;
  const base = {
    externalOrderId: orderId,
    totalCost: 2499.0,
    status,
    date: new Date().toISOString(),
    currency: "UAH",
    email,
    firstName: "Test",
    lastName: "User",
    phone: "+380991234567",
    shipping: 100.0,
    discount: 0,
    deliveryMethod: "Нова Пошта",
    paymentMethod: "Оплата карткою",
    deliveryAddress: "м. Київ, вул. Хрещатик 1, 01001",
    items: TEST_ITEMS,
  };
  if (status === "READY_FOR_PICKUP")
    return { ...base, pickupAddress: "м. Київ, вул. Велика Васильківська 55" };
  if (status === "IN_PROGRESS")
    return { ...base, trackingNumber: "20450000000000" };
  return base;
}

async function sendViaOrdersApi(status: OrderStatus, email: string) {
  const order = buildOrderPayload(status, email);
  const res = await fetch(`${BASE_URL}/orders`, {
    method: "POST",
    headers: { Authorization: AUTH_HEADER, "Content-Type": "application/json" },
    body: JSON.stringify({ orders: [order] }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} — ${body}`);
  }
  return `Orders API ${res.status}`;
}

async function sendViaEventsApi(status: OrderStatus, email: string) {
  const orderId = `#TEST-${Date.now()}`;
  const params: { name: string; value: string }[] = [
    { name: "externalOrderId", value: orderId },
    { name: "totalCost",       value: "2499" },
    { name: "currency",        value: "UAH" },
    { name: "date",            value: new Date().toISOString() },
    { name: "firstName",       value: "Test" },
    { name: "lastName",        value: "User" },
    { name: "phone",           value: "+380991234567" },
    { name: "shipping",        value: "100" },
    { name: "deliveryMethod",  value: "Нова Пошта" },
    { name: "paymentMethod",   value: "Оплата карткою" },
    { name: "deliveryAddress", value: "м. Київ, вул. Хрещатик 1, 01001" },
  ];
  if (status === "READY_FOR_PICKUP")
    params.push({ name: "pickupAddress", value: "м. Київ, вул. Велика Васильківська 55" });

  const body = {
    eventTypeKey: `order${status}`,
    keyValue: email,
    params,
  };

  const res = await fetch(`${BASE_URL}/event`, {
    method: "POST",
    headers: { Authorization: AUTH_HEADER, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} — ${text}`);
  }
  return `Events API ${res.status}`;
}

async function main() {
  const testEmail = process.env.TEST_EMAIL || process.env.ESPUTNIK_API_LOGIN!;

  console.log("=== eSputnik Order Events Test ===");
  console.log(`Login:      ${process.env.ESPUTNIK_API_LOGIN}`);
  console.log(`Test email: ${testEmail}`);
  console.log("");

  const results: { status: OrderStatus; ok: boolean; info: string }[] = [];

  for (const status of STATUSES) {
    const api = ORDERS_API_STATUSES.includes(status) ? "orders" : "event ";
    process.stdout.write(`→ [${api}] ${status.padEnd(18)} (${STATUS_LABELS[status]}) ... `);

    try {
      const info = ORDERS_API_STATUSES.includes(status)
        ? await sendViaOrdersApi(status, testEmail)
        : await sendViaEventsApi(status, testEmail);
      console.log(`✓ ${info}`);
      results.push({ status, ok: true, info });
    } catch (err: any) {
      console.log(`✗ ${err.message}`);
      results.push({ status, ok: false, info: err.message });
    }

    await new Promise((r) => setTimeout(r, 300));
  }

  console.log("\n=== Summary ===");
  const passed = results.filter((r) => r.ok).length;
  console.log(`Passed: ${passed}/${STATUSES.length}`);
  if (passed < STATUSES.length) {
    results.filter((r) => !r.ok).forEach((r) =>
      console.log(`  ✗ ${r.status}: ${r.info}`)
    );
  }
}

main().catch(console.error);
