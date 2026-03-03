/**
 * Test script: search eSputnik email messages via API
 * Run: dotenv -e .env tsx scripts/test-esputnik-messages.ts
 */

const BASE_URL = "https://esputnik.com/api/v1";
const auth = Buffer.from(
  `${process.env.ESPUTNIK_API_LOGIN}:${process.env.ESPUTNIK_API_KEY}`
).toString("base64");
const AUTH_HEADER = `Basic ${auth}`;

async function searchMessages(search?: string) {
  const params = new URLSearchParams({ maxrows: "500" });
  if (search) params.set("search", search);

  console.log(`\n→ GET /messages/email${search ? `?search=${search}` : ""}`);

  const res = await fetch(`${BASE_URL}/messages/email?${params}`, {
    headers: { Authorization: AUTH_HEADER },
  });

  console.log(`  Status: ${res.status} ${res.statusText}`);
  const totalCount = res.headers.get("TotalCount");
  if (totalCount) console.log(`  TotalCount: ${totalCount}`);

  if (!res.ok) {
    const body = await res.text();
    console.error("  Error:", body);
    return;
  }

  const messages: any[] = await res.json();
  if (messages.length === 0) {
    console.log("  No messages found.");
    return;
  }

  for (const m of messages) {
    console.log(`  [${m.id}] ${m.name} — subject: "${m.subject}" | from: ${m.from}`);
    if (m.tags?.length) console.log(`       tags: ${m.tags.join(", ")}`);
  }
}

async function main() {
  console.log("=== eSputnik Messages API Test ===");
  console.log(`Login: ${process.env.ESPUTNIK_API_LOGIN}`);

  // 1. List all messages
  await searchMessages();

  // 2. Search for order-related messages
  await searchMessages("order");
  await searchMessages("замовлення");
  await searchMessages("Mio Mio");
}

main().catch(console.error);
