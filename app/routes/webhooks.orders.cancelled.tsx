import { authenticate } from "@/shopify.server";
import { ActionFunctionArgs } from "react-router";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, admin, session } = await authenticate.webhook(request);

  console.log("🚀 ~ Order Cancelled Webhook Payload:", payload);
  // TODO: Enqueue a job to process the cancelled order asynchronously

  return new Response("OK", { status: 200 });
};
