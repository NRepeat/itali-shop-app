import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { revalidateNextJs } from "@/service/revalidate/revalidate-nextjs";
import { getSyncQueues } from "@/service/sync/sync.registry";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  const queues = getSyncQueues(topic);
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.miomio.com.ua";

  for (const queue of queues) {
    // Only send to googleMerchantSyncQueue for now as it supports Shopify payload
    if (queue.name !== "googleMerchantSyncQueue") {
      continue;
    }

    const numericId = String((payload as any).id).split("/").pop();
    await queue.add(topic, {
      shop,
      topic,
      payload,
      baseUrl,
    }, {
      jobId: `${numericId}${Date.now()}`,
      removeOnComplete: true,
    });
  }

  revalidateNextJs({ type: "product", slug: (payload as any)?.handle }).catch(() => {});

  return new Response(null, { status: 200 });
};
