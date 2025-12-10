import { Worker } from "bullmq";
import Redis from "ioredis";
import { REDIS_CONFIG } from "./shared/config/redis";
import { processSyncTask } from "./service/sync/products/sync-product.worker";

const connection = new Redis(REDIS_CONFIG.port, REDIS_CONFIG.host, {
  ...REDIS_CONFIG.options,
});

const syncWorker = new Worker("sync-queue", processSyncTask, { connection });

syncWorker.on("completed", (job) => {
  console.log(`Job ${job.id} of type ${job.name} finished.`);
});

syncWorker.on("failed", (job, err) => {
  console.error(`Job ${job?.id} failed with error: ${err.message}`);
});

console.log("Worker Service is running and listening for sync-queue jobs...");
