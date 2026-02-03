import { Queue } from "bullmq";
import Redis from "ioredis";
import { REDIS_CONFIG } from "../../config/redis";

const connection = new Redis(REDIS_CONFIG.port, REDIS_CONFIG.host, {
  ...REDIS_CONFIG.options,
});

export interface CollectionSyncJobData {
  action: "create" | "update" | "delete";
  shop: string;
  collectionId: number;
  handle?: string;
}

export const collectionSyncQueue = new Queue<CollectionSyncJobData>(
  "collection-sync-queue",
  {
    connection,
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 500,
    },
  }
);
