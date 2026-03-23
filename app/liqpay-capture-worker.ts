import { Worker } from "bullmq";
import Redis from "ioredis";
import { REDIS_CONFIG } from "./shared/config/redis";
import { processLiqpayCaptureTask } from "./service/liqpay/liqpay-capture.worker";

const connection = new Redis(REDIS_CONFIG.port, REDIS_CONFIG.host, {
  ...REDIS_CONFIG.options,
});

const liqpayCaptureWorker = new Worker(
  "liqpay-capture-queue",
  processLiqpayCaptureTask,
  {
    connection,
    concurrency: 5,
  }
);

liqpayCaptureWorker.on("completed", (job) => {
  console.log(
    `[liqpay-capture] job ${job.id} completed for ${job.data.orderName}`
  );
});

liqpayCaptureWorker.on("failed", (job, err) => {
  console.error(
    `[liqpay-capture] job ${job?.id} failed (attempt ${job?.attemptsMade}/${job?.opts.attempts}) for ${job?.data.orderName}: ${err.message}`
  );
});

liqpayCaptureWorker.on("error", (err) => {
  console.error("[liqpay-capture] worker error:", err);
});

console.log("LiqPay Capture Worker running — listening for liqpay-capture-queue jobs...");
