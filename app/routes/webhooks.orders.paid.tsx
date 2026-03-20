import { authenticate } from "@/shopify.server";
import { ActionFunctionArgs } from "react-router";

// NOTE: Payment confirmation (keyCRM status 3 + eSputnik CONFIRMED) is now triggered
// directly from nnshop's LiqPay callback via POST /api/internal/confirm-payment.
// For non-LiqPay orders the keyCRM webhook (api.keycrm-webhook.ts) handles CONFIRMED
// when the operator sets status 3 in keyCRM.
// This endpoint is kept alive only to satisfy Shopify's webhook subscription.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.log("Received", topic, "webhook for", shop, "(handled via internal API)");

  return new Response(null, { status: 200 });
};
