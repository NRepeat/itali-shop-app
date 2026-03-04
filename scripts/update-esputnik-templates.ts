/**
 * Uploads updated HTML to all 7 eSputnik order email templates via API.
 * Run: dotenv -e .env tsx scripts/update-esputnik-templates.ts
 */

import { readFileSync } from "fs";
import { join } from "path";

const BASE_URL = "https://esputnik.com/api/v1";
const auth = Buffer.from(
  `${process.env.ESPUTNIK_API_LOGIN}:${process.env.ESPUTNIK_API_KEY}`
).toString("base64");
const AUTH_HEADER = `Basic ${auth}`;

const TEMPLATES_DIR = join(
  process.cwd(),
  ".planning/email/templates/esputnik"
);

const TEMPLATES = [
  { id: 4423100, file: "01-zamovlennya-oformleno.html", name: "01 Замовлення оформлено" },
  { id: 4423124, file: "02-pidtverdzheno.html",          name: "02 Підтверджено" },
  { id: 4423125, file: "03-vidpravleno.html",            name: "03 Відправлено" },
  { id: 4423127, file: "04-vykonano.html",               name: "04 Виконано" },
  { id: 4426092, file: "05-hotovo-do-samovyvozu.html",   name: "05 Готово до самовивозу" },
  { id: 4426093, file: "06-tovaru-nemaie-v-nayavnosti.html", name: "06 Товару немає в наявності" },
  { id: 4426094, file: "07-skasovano.html",              name: "07 Скасовано" },
];

async function main() {
  console.log("=== Update eSputnik Email Templates ===\n");

  for (const { id, file, name } of TEMPLATES) {
    process.stdout.write(`→ [${id}] ${name} ... `);
    try {
      const htmlText = readFileSync(join(TEMPLATES_DIR, file), "utf-8");

      const getRes = await fetch(`${BASE_URL}/messages/email/${id}`, {
        headers: { Authorization: AUTH_HEADER },
        signal: AbortSignal.timeout(15000),
      });
      if (!getRes.ok) throw new Error(`GET failed: ${getRes.status} ${getRes.statusText}`);
      const msg = await getRes.json();

      const putRes = await fetch(`${BASE_URL}/messages/email/${id}`, {
        method: "PUT",
        headers: { Authorization: AUTH_HEADER, "Content-Type": "application/json" },
        body: JSON.stringify({ ...msg, htmlText, rawHtml: htmlText }),
        signal: AbortSignal.timeout(15000),
      });
      if (!putRes.ok) {
        const body = await putRes.text();
        throw new Error(`PUT failed: ${putRes.status} — ${body}`);
      }
      console.log("✓");
    } catch (err: any) {
      console.log(`✗ ${err.message}`);
    }
  }

  console.log("\nDone.");
}

main().catch(console.error);
