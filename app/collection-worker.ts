import { Worker } from "bullmq";
import Redis from "ioredis";
import { REDIS_CONFIG } from "./shared/config/redis";
import { processCollectionSyncTask } from "./service/sync/collections/collection-sync.worker";

const connection = new Redis(REDIS_CONFIG.port, REDIS_CONFIG.host, {
  ...REDIS_CONFIG.options,
});

const collectionSyncWorker = new Worker(
  "collection-sync-queue",
  processCollectionSyncTask,
  {
    connection,
    concurrency: 5,
  }
);

collectionSyncWorker.on("completed", (job) => {
  console.log(
    `Collection sync job ${job.id} completed for action: ${job.data.action}`
  );
});

collectionSyncWorker.on("failed", (job, err) => {
  console.error(
    `Collection sync job ${job?.id} failed with error: ${err.message}`
  );
});

collectionSyncWorker.on("error", (err) => {
  console.error("Collection sync worker error:", err);
});

console.log(
  "Collection Sync Worker is running and listening for collection-sync-queue jobs..."
);
