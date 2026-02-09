import { authenticate } from "@/shopify.server";
import { ActionFunctionArgs } from "react-router";
import { esputnikOrderQueue } from "@shared/lib/queue/esputnik-order.queue";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, shop } = await authenticate.webhook(request);

  console.log("🚀 ~ Order Paid Webhook Payload:", payload);

  await esputnikOrderQueue.add("esputnik-order-sync", {
    payload,
    status: "IN_PROGRESS",
    shop,
  });

  return new Response("OK", { status: 200 });
};
