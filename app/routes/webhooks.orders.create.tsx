import { authenticate } from "@/shopify.server";
import { ActionFunctionArgs } from "react-router";

// NOTE: Order processing (KeyCRM + eSputnik INITIALIZED) is now triggered directly
// from nnshop's createOrder() server action via POST /api/internal/process-order.
// This webhook is kept alive only because Shopify requires a registered endpoint
// to send webhooks to — it must return 200 or Shopify will retry and eventually
// uninstall the webhook subscription.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.log("Received", topic, "webhook for", shop, "(handled via internal API)");

  return new Response(null, { status: 200 });
};
