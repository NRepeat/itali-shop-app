import { authenticate } from "@/shopify.server";
import { ActionFunctionArgs } from "react-router";

// NOTE: Cancellation is initiated by KeyCRM webhook (api.keycrm-webhook.ts),
// which already queues the CANCELLED eSputnik email and cancels the order in Shopify.
// This webhook fires as a side effect — no additional processing needed.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.log("Received", topic, "webhook for", shop);

  return new Response(null, { status: 200 });
};
