import type { ActionFunctionArgs } from "react-router";
import {
  findKeyCrmOrderBySourceUuid,
  updateOrderInKeyCrm,
  fetchKeyCrmOrderPayments,
  markKeyCrmPaymentAsPaid,
} from "@/service/keycrm/keycrm-order.service";
import { esputnikOrderQueue } from "@shared/lib/queue/esputnik-order.queue";
import { KEYCRM_CONFIG } from "@shared/config/keycrm";

const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET;

// POST /api/internal/confirm-payment
// Called from nnshop LiqPay callback after payment is confirmed.
// Marks the keyCRM order as confirmed (status 3) + paid, and queues eSputnik CONFIRMED.
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  if (INTERNAL_API_SECRET) {
    const authHeader = request.headers.get("Authorization");
    if (authHeader !== `Bearer ${INTERNAL_API_SECRET}`) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let body: {
    orderName: string;
    amount: number;
    currency: string;
    paymentMethod?: string;
    shopifyPayload?: Record<string, any>;
    shop?: string;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { orderName, amount, currency, paymentMethod = "liqpay", shopifyPayload, shop } = body;
  if (!orderName || typeof orderName !== "string") {
    return Response.json({ error: "Missing or invalid orderName" }, { status: 400 });
  }
  if (typeof amount !== "number" || isNaN(amount) || amount <= 0) {
    return Response.json({ error: "Missing or invalid amount" }, { status: 400 });
  }

  // Retry up to 5x with 1s delay — keyCRM order may not be created yet
  // if the BullMQ INITIALIZED job hasn't processed yet
  let keycrmOrder: { id: number } | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    keycrmOrder = await findKeyCrmOrderBySourceUuid(orderName);
    if (keycrmOrder) break;
    if (attempt < 4) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  if (!keycrmOrder) {
    console.warn(
      `[internal/confirm-payment] keyCRM order not found for ${orderName} after retries`
    );
    return Response.json(
      { error: "keyCRM order not found", orderName },
      { status: 404 }
    );
  }

  // Mark keyCRM order as confirmed + ensure payment record exists
  await updateOrderInKeyCrm(keycrmOrder.id, {
    status_id: KEYCRM_CONFIG.statuses.confirmed,
    payments: [
      {
        payment_method: paymentMethod,
        amount: Math.round(amount),
        currency,
        status: "paid",
      },
    ],
  });

  // Fetch payment ID and mark it as paid via dedicated endpoint
  try {
    const payments = await fetchKeyCrmOrderPayments(keycrmOrder.id);
    const payment = payments[0];
    if (payment?.id) {
      await markKeyCrmPaymentAsPaid(keycrmOrder.id, payment.id);
    } else {
      console.warn(`[internal/confirm-payment] no payment found on keyCRM order ${keycrmOrder.id}`);
    }
  } catch (err) {
    console.error(`[internal/confirm-payment] failed to mark payment as paid for keyCRM order ${keycrmOrder.id}:`, err);
  }

  console.log(
    `[internal/confirm-payment] keyCRM order ${keycrmOrder.id} confirmed + paid (${orderName})`
  );

  // Queue eSputnik CONFIRMED email
  if (shopifyPayload && shop) {
    await esputnikOrderQueue.add("esputnik-order-sync", {
      payload: shopifyPayload,
      status: "CONFIRMED",
      shop,
    });
    console.log(`[internal/confirm-payment] eSputnik CONFIRMED queued for ${orderName}`);
  }

  return Response.json({ ok: true, keycrmOrderId: keycrmOrder.id }, { status: 200 });
};
