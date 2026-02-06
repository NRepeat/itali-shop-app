import { authenticate } from "@/shopify.server";
import { ActionFunctionArgs } from "react-router";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, admin, session } = await authenticate.webhook(request);

  console.log("🚀 ~ Order Create Webhook Payload:", payload);
  // console.log("🚀 ~ Order Create Webhook Admin:", admin); // Uncomment if needed for debugging Shopify Admin client
  // console.log("🚀 ~ Order Create Webhook Session:", session); // Uncomment if needed for session details

  // TODO: Enqueue a job to process the order asynchronously
  // Example: await orderQueue.add('order-create', { order: payload });

  return new Response("OK", { status: 200 });
};
