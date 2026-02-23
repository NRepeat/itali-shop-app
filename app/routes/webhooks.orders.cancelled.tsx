import { authenticate } from "@/shopify.server";
import { ActionFunctionArgs } from "react-router";
import { getSyncQueue } from "~/service/sync/sync.registry";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, shop, topic } = await authenticate.webhook(request);

  console.log("🚀 ~ Received", topic, "webhook for", shop);

  const queue = getSyncQueue(topic);
  if (queue) {
    await queue.add(topic, { shop, topic, payload });
  } else {
    console.error(`No sync queue found for topic: ${topic}`);
  }

  return new Response(null, { status: 200 });
};
