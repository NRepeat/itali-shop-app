import { Worker } from "bullmq";
import Redis from "ioredis";
import { REDIS_CONFIG } from "./shared/config/redis";
import { processSyncTask } from "./service/sync/products/sync-product.worker";

const connection = new Redis(REDIS_CONFIG.port, REDIS_CONFIG.host, {
  ...REDIS_CONFIG.options,
});

const productWorker = new Worker("productSyncQueue", processSyncTask, {
  connection,
  concurrency: 10,
});

productWorker.on("completed", (job) => {
  console.log(`Job ${job.id} (${job.name}) completed.`);
});

productWorker.on("failed", (job, err) => {
  console.error(`Job ${job?.id} failed: ${err.message}`);
});

console.log("Worker Service is running and listening for productSyncQueue jobs...");
