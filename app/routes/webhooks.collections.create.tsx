import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getSyncQueues } from "@/service/sync/sync.registry";
import { revalidateNextJs } from "@/service/revalidate/revalidate-nextjs";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  const queues = getSyncQueues(topic);
  for (const queue of queues) {
    await queue.add(topic, {
      action: "create",
      shop,
      collectionId: (payload as any).id,
    });
  }

  revalidateNextJs({ type: "collection", slug: (payload as any)?.handle }).catch(() => {});

  return new Response(null, { status: 200 });
};
