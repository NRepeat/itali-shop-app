import crypto from "crypto";

const NEXT_APP_URL = process.env.NEXT_APP_URL ?? "";
const NEXT_REVALIDATE_SECRET = process.env.NEXT_REVALIDATE_SECRET ?? "";

/**
 * Calls the Next.js /api/revalidate/path endpoint with a signed body.
 * Uses HMAC-SHA256 matching next-sanity/webhook parseBody expectations.
 */
export async function revalidateNextJs(payload: {
  type: string;
  slug?: string;
}): Promise<void> {
  if (!NEXT_APP_URL || !NEXT_REVALIDATE_SECRET) {
    console.warn("[revalidate] NEXT_APP_URL or NEXT_REVALIDATE_SECRET not set, skipping.");
    return;
  }

  const body = JSON.stringify(payload);
  const timestamp = Date.now();
  const hmac = crypto
    .createHmac("sha256", NEXT_REVALIDATE_SECRET.trim())
    .update(`${timestamp}.${body}`)
    .digest();
  const b64url = hmac.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const signature = `t=${timestamp},v1=${b64url}`;

  try {
    const res = await fetch(`${NEXT_APP_URL}/api/revalidate/path`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "sanity-webhook-signature": signature,
      },
      body,
    });
    if (!res.ok) {
      console.error(`[revalidate] Failed: ${res.status} ${await res.text()}`);
    } else {
      console.log(`[revalidate] OK — type=${payload.type} slug=${payload.slug ?? "-"}`);
    }
  } catch (err) {
    console.error("[revalidate] Request error:", err);
  }
}
