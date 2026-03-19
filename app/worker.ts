import { Worker } from "bullmq";
import Redis from "ioredis";
import { REDIS_CONFIG } from "./shared/config/redis";
import { processSyncTask } from "./service/sync/products/sync-product.worker";
import { processGoogleMerchantTask, googleMerchantQueueName } from "./service/google-merchant/google-merchant.worker";

const connection = new Redis(REDIS_CONFIG.port, REDIS_CONFIG.host, {
  ...REDIS_CONFIG.options,
});

const productWorker = new Worker("productSyncQueue", processSyncTask, {
  connection,
  concurrency: 10,
});

const googleMerchantWorker = new Worker(googleMerchantQueueName, processGoogleMerchantTask, {
  connection,
  concurrency: 3, // Rate limiting for Google Merchant API
  limiter: {
    max: 5,
    duration: 1000, // 5 req/sec
  },
});

productWorker.on("completed", (job) => {
  console.log(`Job ${job.id} (${job.name}) completed.`);
});

productWorker.on("failed", (job, err) => {
  console.error(`Job ${job?.id} failed: ${err.message}`);
});

googleMerchantWorker.on("completed", (job) => {
  console.log(`Google Merchant Job ${job.id} (${job.name}) completed.`);
});

googleMerchantWorker.on("failed", (job, err) => {
  console.error(`Google Merchant Job ${job?.id} failed: ${err?.message}`);
});

console.log("Worker Service is running and listening for productSyncQueue and googleMerchantSyncQueue jobs...");
