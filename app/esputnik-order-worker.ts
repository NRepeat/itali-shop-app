import { Worker } from "bullmq";
import Redis from "ioredis";
import { REDIS_CONFIG } from "./shared/config/redis";
import { processEsputnikOrderTask } from "./service/esputnik/esputnik-order.worker";

const connection = new Redis(REDIS_CONFIG.port, REDIS_CONFIG.host, {
  ...REDIS_CONFIG.options,
});

const esputnikOrderWorker = new Worker(
  "esputnik-order-queue",
  processEsputnikOrderTask,
  {
    connection,
    concurrency: 5,
  }
);

esputnikOrderWorker.on("completed", (job) => {
  console.log(
    `eSputnik order job ${job.id} completed (status: ${job.data.status})`
  );
});

esputnikOrderWorker.on("failed", (job, err) => {
  console.error(
    `eSputnik order job ${job?.id} failed with error: ${err.message}`
  );
});

esputnikOrderWorker.on("error", (err) => {
  console.error("eSputnik order worker error:", err);
});

console.log(
  "eSputnik Order Worker is running and listening for esputnik-order-queue jobs..."
);
