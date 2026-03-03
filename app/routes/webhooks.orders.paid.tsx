import { authenticate } from "@/shopify.server";
import { ActionFunctionArgs } from "react-router";

// NOTE: orders/paid fires when payment is captured.
// KeyCRM and eSputnik status updates for this event are driven by
// the KeyCRM webhook (api.keycrm-webhook.ts) once the operator confirms the order,
// so no additional queuing is needed here.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.log("Received", topic, "webhook for", shop);

  return new Response(null, { status: 200 });
};
