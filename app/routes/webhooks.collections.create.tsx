import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getSyncQueue } from "@/service/sync/sync.registry";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  const queue = getSyncQueue(topic);
  if (queue) {
    await queue.add(topic, {
      action: "create",
      shop,
      collectionId: (payload as any).id,
    });
  }



  return new Response(null, { status: 200 });
};
