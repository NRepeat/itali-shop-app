import { authenticate } from "@/shopify.server";
import { ActionFunctionArgs } from "react-router";
import { esputnikOrderQueue } from "@shared/lib/queue/esputnik-order.queue";
import { keycrmOrderQueue } from "@shared/lib/queue/keycrm-order.queue";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, shop } = await authenticate.webhook(request);

  console.log("🚀 ~ Order Cancelled Webhook Payload:", payload);

  await Promise.all([
    esputnikOrderQueue.add("esputnik-order-sync", {
      payload,
      status: "CANCELLED",
      shop,
    }),
    // keycrmOrderQueue.add("keycrm-order-sync", {
    //   payload,
    //   status: "CANCELLED",
    //   shop,
    // }),
  ]);

  return new Response("OK", { status: 200 });
};
