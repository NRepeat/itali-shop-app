const BASE_URL = "https://esputnik.com/api/v1";
const auth = Buffer.from(
  `${process.env.ESPUTNIK_API_LOGIN}:${process.env.ESPUTNIK_API_KEY}`
).toString("base64");
const AUTH_HEADER = `Basic ${auth}`;

const res = await fetch(`${BASE_URL}/messages/email/4423100`, {
  headers: { Authorization: AUTH_HEADER },
});
const msg = await res.json();

console.log("htmlText has #1a1a1a:", msg.htmlText?.includes("1a1a1a") ? "YES ✓" : "NO ✗");
console.log("rawHtml has #1a1a1a:", msg.rawHtml?.includes("1a1a1a") ? "YES ✓" : "NO ✗ (length: " + (msg.rawHtml?.length ?? 0) + ")");
console.log("rawHtml start:", msg.rawHtml?.slice(0, 200) ?? "empty");
