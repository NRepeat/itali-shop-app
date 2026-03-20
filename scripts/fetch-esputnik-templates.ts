/**
 * Fetches specific email templates from eSputnik and saves them locally.
 * Run: dotenv -e .env tsx scripts/fetch-esputnik-templates.ts
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
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
  { id: 4428255, file: "08-znyzhennya-tsiny.html",       name: "08 Зниження ціни" },
];

async function fetchTemplateDetail(id: number) {
  const response = await fetch(`${BASE_URL}/messages/email/${id}`, {
    headers: { Authorization: AUTH_HEADER },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`eSputnik fetch message ${id} error: ${response.status} — ${body}`);
  }

  return response.json();
}

async function main() {
  console.log("=== Fetch eSputnik Email Templates ===\n");

  if (!existsSync(TEMPLATES_DIR)) {
    mkdirSync(TEMPLATES_DIR, { recursive: true });
  }

  try {
    for (const { id, file, name } of TEMPLATES) {
      process.stdout.write(`→ Fetching [${id}] ${name} ... `);
      
      const detail = await fetchTemplateDetail(id);
      
      const hasVelocityRaw = detail.rawHtml?.includes("#foreach");
      const hasVelocityHtml = detail.htmlText?.includes("#foreach");

      console.log(`(Velocity: raw=${hasVelocityRaw}, html=${hasVelocityHtml})`);

      // We NEED the one with Velocity.
      let htmlContent = "";
      if (hasVelocityRaw) {
          htmlContent = detail.rawHtml;
      } else if (hasVelocityHtml) {
          htmlContent = detail.htmlText;
      } else {
          // Fallback but maybe it's missing?
          htmlContent = detail.rawHtml || detail.htmlText || "";
      }
      
      if (htmlContent) {
        writeFileSync(join(TEMPLATES_DIR, file), htmlContent);
        console.log(`  ✓ saved to ${file}`);
      } else {
        console.log("  ✗ no HTML found");
      }
    }

  } catch (err: any) {
    console.error(`\nError: ${err.message}`);
  }

  console.log("\nDone.");
}

main().catch(console.error);
