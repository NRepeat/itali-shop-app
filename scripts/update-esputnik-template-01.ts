/**
 * Updates htmlText of message 4423100 (01-zamovlennya-oformleno)
 * to use orderName + orderDate instead of externalOrderId + date.
 * Run: dotenv -e .env tsx scripts/update-esputnik-template-01.ts
 */

import { readFileSync } from "fs";
import { join } from "path";

const BASE_URL = "https://esputnik.com/api/v1";
const auth = Buffer.from(
  `${process.env.ESPUTNIK_API_LOGIN}:${process.env.ESPUTNIK_API_KEY}`
).toString("base64");
const AUTH_HEADER = `Basic ${auth}`;

const MESSAGE_ID = 4423100;
const TEMPLATE_PATH = join(
  process.cwd(),
  ".planning/email/templates/esputnik/01-zamovlennya-oformleno.html"
);

async function main() {
  console.log("=== Update eSputnik Template 01 HTML ===\n");

  const htmlText = readFileSync(TEMPLATE_PATH, "utf-8");

  process.stdout.write(`→ GET message ${MESSAGE_ID} ... `);
  const getRes = await fetch(`${BASE_URL}/messages/email/${MESSAGE_ID}`, {
    headers: { Authorization: AUTH_HEADER },
    signal: AbortSignal.timeout(15000),
  });
  if (!getRes.ok) throw new Error(`GET failed: ${getRes.status} ${getRes.statusText}`);
  const msg = await getRes.json();
  console.log("✓");

  process.stdout.write(`→ PUT updated htmlText ... `);
  const putRes = await fetch(`${BASE_URL}/messages/email/${MESSAGE_ID}`, {
    method: "PUT",
    headers: { Authorization: AUTH_HEADER, "Content-Type": "application/json" },
    body: JSON.stringify({ ...msg, htmlText }),
    signal: AbortSignal.timeout(15000),
  });
  if (!putRes.ok) {
    const body = await putRes.text();
    throw new Error(`PUT failed: ${putRes.status} — ${body}`);
  }
  console.log("✓  orderName + orderDate applied");
}

main().catch(console.error);
