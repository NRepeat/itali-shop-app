/**
 * Creates the price drop notification email template in eSputnik via API.
 * This template is used in the "priceDropped" event workflow.
 *
 * Run: dotenv -e .env tsx scripts/create-esputnik-price-template.ts
 *
 * After running, go to eSputnik → Messages and note the returned message ID.
 * Then create/update the "priceDropped" event workflow to send this message.
 *
 * Event params available in the template:
 *   productId, productTitle, variantTitle, productHandle, productUrl,
 *   productImageUrl, newPrice, oldPrice, currency, subscriptionId
 */

import { readFileSync } from "fs";
import { join } from "path";

const BASE_URL = "https://esputnik.com/api/v1";
const auth = Buffer.from(
  `${process.env.ESPUTNIK_API_LOGIN}:${process.env.ESPUTNIK_API_KEY}`
).toString("base64");
const AUTH_HEADER = `Basic ${auth}`;

const TEMPLATE_PATH = join(
  process.cwd(),
  ".planning/email/templates/esputnik/08-znyzhennya-tsiny.html"
);

async function main() {
  console.log("=== Create eSputnik Price Drop Template ===\n");

  const htmlText = readFileSync(TEMPLATE_PATH, "utf-8");

  process.stdout.write("→ POST new message ... ");
  const res = await fetch(`${BASE_URL}/messages/email`, {
    method: "POST",
    headers: {
      Authorization: AUTH_HEADER,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "Зниження ціни",
      subject: "Ціна на $!data.get('productTitle') знизилась!",
      from: '"Міо Міо" <info@miomio.com.ua>',
      htmlText,
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const body = await res.text();
    console.log(`✗ ${res.status} ${res.statusText} — ${body}`);
    process.exit(1);
  }

  const result = await res.json();
  console.log(`✓ created id=${result.id}`);
  console.log(`\n→ Message ID: ${result.id}`);
  console.log("→ Next: create a workflow in eSputnik triggered by event 'priceDropped' that sends this message.");
}

main().catch(console.error);
