import type { ActionFunctionArgs } from "react-router";
import { esputnikOrderQueue } from "@shared/lib/queue/esputnik-order.queue";
import { keycrmOrderQueue } from "@shared/lib/queue/keycrm-order.queue";

const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET;

// POST /api/internal/process-order
// Called directly from nnshop createOrder() instead of waiting for orders/create webhook.
// This bypasses the Shopify webhook delay (~1 min) and triggers KeyCRM + eSputnik immediately.
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

  let body: { payload: Record<string, any>; shop: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { payload, shop } = body;
  if (!payload || !shop) {
    return Response.json({ error: "Missing payload or shop" }, { status: 400 });
  }

  await keycrmOrderQueue.add("keycrm-order-sync", {
    payload,
    status: "INITIALIZED",
    shop,
  });

  await esputnikOrderQueue.add("esputnik-order-sync", {
    payload,
    status: "INITIALIZED",
    shop,
  });

  console.log(`[internal/process-order] queued INITIALIZED for order ${payload.name}`);
  return Response.json({ ok: true }, { status: 200 });
};
