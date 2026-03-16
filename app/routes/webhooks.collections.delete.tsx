import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { collectionSyncQueue } from "@shared/lib/queue/collection-sync.queue";
import { getSyncQueue } from "@/service/sync/sync.registry";
import { revalidateNextJs } from "@/service/revalidate/revalidate-nextjs";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  await getSyncQueue(topic)?.add(topic, {
    action: "delete",
    shop,
    collectionId: (payload as any).id,
  });

  // console.log(`Added collection ${collectionData.id} delete to sync queue`);

  revalidateNextJs({ type: "collection", slug: (payload as any)?.handle }).catch(() => {});

  return new Response(null, { status: 200 });
};
