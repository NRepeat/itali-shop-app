import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { collectionSyncQueue } from "@shared/lib/queue/collection-sync.queue";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  const collectionData = payload as {
    id: number;
    handle: string;
    title: string;
    body_html: string;
    published_at: string;
    updated_at: string;
    image?: {
      src: string;
      alt: string;
    };
  };

  await collectionSyncQueue.add(
    "sync-collection",
    {
      action: "create",
      shop,
      collectionId: collectionData.id,
      handle: collectionData.handle,
    },
    {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 5000,
      },
    }
  );

  console.log(`Added collection ${collectionData.id} to sync queue`);

  return new Response();
};
