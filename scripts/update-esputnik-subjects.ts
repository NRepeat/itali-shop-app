/**
 * Updates subjects of all 7 order email messages to use Velocity syntax.
 * Run: dotenv -e .env tsx scripts/update-esputnik-subjects.ts
 */

const BASE_URL = "https://esputnik.com/api/v1";
const auth = Buffer.from(
  `${process.env.ESPUTNIK_API_LOGIN}:${process.env.ESPUTNIK_API_KEY}`
).toString("base64");
const AUTH_HEADER = `Basic ${auth}`;

const MESSAGES = [
  { id: 4423100, subject: "$!data.get('firstName'), замовлення №$!data.get('externalOrderId') прийнято" },
  { id: 4423124, subject: "$!data.get('firstName'), замовлення №$!data.get('externalOrderId') підтверджено" },
  { id: 4423125, subject: "Замовлення №$!data.get('externalOrderId') відправлено" },
  { id: 4423127, subject: "Замовлення №$!data.get('externalOrderId') виконано — дякуємо!" },
  { id: 4426092, subject: "$!data.get('firstName'), замовлення №$!data.get('externalOrderId') готове до видачі" },
  { id: 4426093, subject: "$!data.get('firstName'), товар у замовленні №$!data.get('externalOrderId') недоступний" },
  { id: 4426094, subject: "Замовлення №$!data.get('externalOrderId') скасовано" },
];

async function getMessage(id: number): Promise<any> {
  const res = await fetch(`${BASE_URL}/messages/email/${id}`, {
    headers: { Authorization: AUTH_HEADER },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`GET ${id}: ${res.status} ${res.statusText}`);
  return res.json();
}

async function updateMessage(id: number, patch: any): Promise<void> {
  const res = await fetch(`${BASE_URL}/messages/email/${id}`, {
    method: "PUT",
    headers: { Authorization: AUTH_HEADER, "Content-Type": "application/json" },
    body: JSON.stringify(patch),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`PUT ${id}: ${res.status} — ${body}`);
  }
}

async function main() {
  console.log("=== Update eSputnik Message Subjects ===\n");

  for (const { id, subject } of MESSAGES) {
    process.stdout.write(`→ [${id}] ... `);
    try {
      const msg = await getMessage(id);
      await updateMessage(id, { ...msg, subject });
      console.log(`✓  "${subject}"`);
    } catch (err: any) {
      console.log(`✗ ${err.message}`);
    }
  }
}

main().catch(console.error);
