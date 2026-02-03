import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { collectionSyncQueue } from "@shared/lib/queue/collection-sync.queue";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  const collectionData = payload as {
    id: number;
  };

  await collectionSyncQueue.add(
    "sync-collection",
    {
      action: "delete",
      shop,
      collectionId: collectionData.id,
    },
    {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 5000,
      },
    }
  );

  console.log(`Added collection ${collectionData.id} delete to sync queue`);

  return new Response();
};
