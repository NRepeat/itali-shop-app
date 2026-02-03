import type { Job } from "bullmq";

import {
  syncCollectionToSanity,
  deleteCollectionFromSanity,
} from "./collection-sync.service";
import { CollectionSyncJobData } from "@shared/lib/queue/collection-sync.queue";

export async function processCollectionSyncTask(
  job: Job<CollectionSyncJobData>
): Promise<void> {
  const { action, shop, collectionId } = job.data;

  console.log(
    `Processing collection sync job: ${action} for collection ${collectionId} from ${shop}`
  );

  try {
    switch (action) {
      case "create":
      case "update":
        await syncCollectionToSanity(shop, collectionId);
        break;

      case "delete":
        await deleteCollectionFromSanity(collectionId);
        break;

      default:
        console.warn(`Unknown action: ${action}`);
    }
  } catch (error) {
    console.error(`Error processing collection sync job:`, error);
    throw error; // Re-throw to trigger BullMQ retry
  }
}
