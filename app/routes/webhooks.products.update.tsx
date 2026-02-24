import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getSyncQueue } from "@/service/sync/sync.registry";
import { revalidateNextJs } from "@/service/revalidate/revalidate-nextjs";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  const queue = getSyncQueue(topic);
  if (queue) {
    await queue.add(topic, { shop, topic, payload });
  } else {
    console.error(`No sync queue found for topic: ${topic}`);
  }

  revalidateNextJs({ type: "product", slug: (payload as any)?.handle }).catch(() => {});

  return new Response(null, { status: 200 });
};
