import type { ActionFunctionArgs } from "react-router";
import {
  handleKeyCrmOrderStatusChange,
  type KeyCrmWebhookPayload,
} from "@/service/keycrm/keycrm-shopify-sync.service";

const KEYCRM_WEBHOOK_SECRET = process.env.KEYCRM_WEBHOOK_SECRET;

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  if (KEYCRM_WEBHOOK_SECRET) {
    const url = new URL(request.url);
    const token = url.searchParams.get("token");
    if (token !== KEYCRM_WEBHOOK_SECRET) {
      console.warn("keyCRM webhook: invalid token");
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let payload: KeyCrmWebhookPayload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  console.log("keyCRM webhook received:", payload.event, payload.context?.id);

  if (payload.event === "order.change_order_status") {
    try {
      await handleKeyCrmOrderStatusChange(payload);
    } catch (error) {
      console.error("Error processing keyCRM webhook:", error);
      return Response.json(
        { error: "Processing failed" },
        { status: 500 }
      );
    }
  } else {
    console.log(`keyCRM webhook event "${payload.event}" not handled`);
  }

  return Response.json({ ok: true }, { status: 200 });
};
