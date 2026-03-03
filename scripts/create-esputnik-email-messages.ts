/**
 * Creates the 3 missing eSputnik email templates via API (bypasses editor encoding issues).
 * Run: dotenv -e .env tsx scripts/create-esputnik-email-messages.ts
 */

import { readFileSync } from "fs";
import { join } from "path";

const BASE_URL = "https://esputnik.com/api/v1";
const auth = Buffer.from(
  `${process.env.ESPUTNIK_API_LOGIN}:${process.env.ESPUTNIK_API_KEY}`
).toString("base64");
const AUTH_HEADER = `Basic ${auth}`;
const FROM = '"Info Mio Mio" <info@miomio.com.ua>';

const TEMPLATES_DIR = join(
  process.cwd(),
  ".planning/email/templates/esputnik"
);

const MESSAGES = [
  {
    file: "05-hotovo-do-samovyvozu.html",
    name: "Замовлення готове до видачі",
    subject: "{{firstName}}, замовлення №{{orderId}} готове до видачі",
  },
  {
    file: "06-tovaru-nemaie-v-nayavnosti.html",
    name: "Товар недоступний",
    subject: "{{firstName}}, товар у замовленні №{{orderId}} недоступний",
  },
  {
    file: "07-skasovano.html",
    name: "Замовлення скасовано",
    subject: "Замовлення №{{orderId}} скасовано",
  },
];

async function createMessage(
  name: string,
  subject: string,
  htmlText: string
): Promise<{ id: number; name: string }> {
  const res = await fetch(`${BASE_URL}/messages/email`, {
    method: "POST",
    headers: {
      Authorization: AUTH_HEADER,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name, subject, from: FROM, htmlText }),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${res.statusText} — ${body}`);
  }

  return res.json();
}

async function main() {
  console.log("=== Create eSputnik Email Messages ===\n");

  for (const { file, name, subject } of MESSAGES) {
    const path = join(TEMPLATES_DIR, file);
    process.stdout.write(`→ ${name} (${file}) ... `);

    try {
      const html = readFileSync(path, "utf-8");
      const result = await createMessage(name, subject, html);
      console.log(`✓ created id=${result.id}`);
    } catch (err: any) {
      console.log(`✗ ${err.message}`);
    }
  }
}

main().catch(console.error);
