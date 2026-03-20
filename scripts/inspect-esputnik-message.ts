/**
 * Inspects a single eSputnik email message detail for Velocity logic.
 * Run: dotenv -e .env tsx scripts/inspect-esputnik-message.ts
 */

const BASE_URL = "https://esputnik.com/api/v1";
const auth = Buffer.from(
  `${process.env.ESPUTNIK_API_LOGIN}:${process.env.ESPUTNIK_API_KEY}`
).toString("base64");
const AUTH_HEADER = `Basic ${auth}`;

const MESSAGE_ID = 4423100;

async function main() {
  const response = await fetch(`${BASE_URL}/messages/email/${MESSAGE_ID}`, {
    headers: { Authorization: AUTH_HEADER },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`eSputnik fetch message ${MESSAGE_ID} error: ${response.status} — ${body}`);
  }

  const detail = await response.json();
  
  console.log("htmlText has #foreach:", detail.htmlText?.includes("#foreach") ? "YES ✓" : "NO ✗");
  console.log("rawHtml has #foreach:", detail.rawHtml?.includes("#foreach") ? "YES ✓" : "NO ✗");
  console.log("htmlText has $!data.get:", detail.htmlText?.includes("$!data.get") ? "YES ✓" : "NO ✗");
  console.log("rawHtml has $!data.get:", detail.rawHtml?.includes("$!data.get") ? "YES ✓" : "NO ✗");

  if (detail.htmlText?.includes("#foreach")) {
      console.log("\nFound #foreach in htmlText around:");
      const index = detail.htmlText.indexOf("#foreach");
      console.log(detail.htmlText.substring(index - 50, index + 200));
  }
}

main().catch(console.error);
