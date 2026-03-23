import type { Job } from "bullmq";
import type { LiqpayCaptureJobData } from "@shared/lib/queue/liqpay-capture.queue";
import { LiqPayClient } from "@shared/lib/liqpay";

const NNSHOP_URL = process.env.NEXT_APP_URL || "https://www.miomio.com.ua";
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET;
const LIQPAY_PUBLIC_KEY = process.env.LIQPAY_PUBLIC_KEY!;
const LIQPAY_PRIVATE_KEY = process.env.LIQPAY_PRIVATE_KEY!;

/**
 * Polls LiqPay payment status and triggers hold_completion via nnshop
 * once the payment moves from wait_secure → hold_wait.
 *
 * Called when CRM confirms an order while LiqPay payment is still in wait_secure.
 * Retries up to 20 times with 60s fixed delay (~20 minutes total window).
 */
export async function processLiqpayCaptureTask(
  job: Job<LiqpayCaptureJobData>
): Promise<void> {
  const { shopifyOrderId, orderName } = job.data;
  const attempt = job.attemptsMade + 1;
  console.log(
    `[liqpay-capture] attempt ${attempt} for ${orderName} (${shopifyOrderId})`
  );

  // 1. Check current LiqPay payment status
  const liqpay = new LiqPayClient(LIQPAY_PUBLIC_KEY, LIQPAY_PRIVATE_KEY);
  let liqpayStatus: string | undefined;
  try {
    const statusResult = await liqpay.api("request", {
      version: 3,
      action: "status",
      order_id: shopifyOrderId,
    });
    liqpayStatus = statusResult?.status;
    console.log(
      `[liqpay-capture] LiqPay status for ${orderName}: ${liqpayStatus}`
    );
  } catch (err) {
    console.warn(`[liqpay-capture] status check failed for ${orderName}:`, err);
    // Don't give up — network hiccup, retry
    throw new Error(`LiqPay status check failed: ${err}`);
  }

  // 2. Terminal states — stop retrying
  if (
    liqpayStatus === "error" ||
    liqpayStatus === "failure" ||
    liqpayStatus === "reversed" ||
    liqpayStatus === "expired"
  ) {
    console.log(
      `[liqpay-capture] terminal status ${liqpayStatus} for ${orderName} — stopping`
    );
    return;
  }

  // 3. Already captured (success callback or nnshop capture already ran)
  if (liqpayStatus === "success" || liqpayStatus === "sandbox") {
    console.log(
      `[liqpay-capture] already captured (status=${liqpayStatus}) for ${orderName} — stopping`
    );
    return;
  }

  // 4. Still in bank verification — retry later
  if (liqpayStatus === "wait_secure" || liqpayStatus === "processing") {
    throw new Error(
      `Payment still in ${liqpayStatus} for ${orderName} — will retry`
    );
  }

  // 5. hold_wait — trigger capture via nnshop
  if (liqpayStatus === "hold_wait" || liqpayStatus === "sandbox_hold_wait") {
    console.log(
      `[liqpay-capture] hold_wait reached for ${orderName} — triggering capture`
    );
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (INTERNAL_API_SECRET)
      headers["Authorization"] = `Bearer ${INTERNAL_API_SECRET}`;

    const res = await fetch(`${NNSHOP_URL}/api/liqpay/capture`, {
      method: "POST",
      headers,
      body: JSON.stringify({ shopifyOrderId: `gid://shopify/Order/${shopifyOrderId}` }),
    });

    const body = await res.json().catch(() => ({}));
    console.log(
      `[liqpay-capture] capture response ${res.status} for ${orderName}:`,
      body
    );

    if (res.ok) return; // 200 — captured
    if (res.status === 202) {
      // Still pending — shouldn't happen since we checked hold_wait, but retry anyway
      throw new Error(`Capture returned 202 after hold_wait for ${orderName}`);
    }
    if (
      (body as any)?.message?.includes("Already captured") ||
      (body as any)?.message?.includes("Capture in progress")
    ) {
      return; // Already handled
    }
    throw new Error(
      `Capture failed (${res.status}) for ${orderName}: ${JSON.stringify(body)}`
    );
  }

  // Unknown status — retry
  throw new Error(
    `Unknown LiqPay status ${liqpayStatus} for ${orderName} — will retry`
  );
}
