import { Worker } from "bullmq";
import Redis from "ioredis";
import { REDIS_CONFIG } from "./shared/config/redis";
import { processKeyCrmOrderTask } from "./service/keycrm/keycrm-order.worker";

const connection = new Redis(REDIS_CONFIG.port, REDIS_CONFIG.host, {
  ...REDIS_CONFIG.options,
});

const keycrmOrderWorker = new Worker(
  "keycrm-order-queue",
  processKeyCrmOrderTask,
  {
    connection,
    concurrency: 5,
  }
);

keycrmOrderWorker.on("completed", (job) => {
  console.log(
    `keyCRM order job ${job.id} completed (status: ${job.data.status})`
  );
});

keycrmOrderWorker.on("failed", (job, err) => {
  console.error(
    `keyCRM order job ${job?.id} failed with error: ${err.message}`
  );
});

keycrmOrderWorker.on("error", (err) => {
  console.error("keyCRM order worker error:", err);
});

console.log(
  "keyCRM Order Worker is running and listening for keycrm-order-queue jobs..."
);
