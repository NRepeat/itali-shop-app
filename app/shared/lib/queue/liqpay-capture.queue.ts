import { Queue } from "bullmq";
import Redis from "ioredis";
import { REDIS_CONFIG } from "../../config/redis";

const connection = new Redis(REDIS_CONFIG.port, REDIS_CONFIG.host, {
  ...REDIS_CONFIG.options,
});

export interface LiqpayCaptureJobData {
  /** Numeric Shopify order ID (without GID prefix) */
  shopifyOrderId: string;
  orderName: string;
}

/**
 * Queue for retrying LiqPay hold_completion when the payment was still
 * in wait_secure at the time of CRM confirmation.
 * Worker polls LiqPay status every 60s and captures once hold_wait is reached.
 */
export const liqpayCaptureQueue = new Queue<LiqpayCaptureJobData>(
  "liqpay-capture-queue",
  {
    connection,
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 200,
      attempts: 20,
      backoff: {
        type: "fixed",
        delay: 60_000, // poll every 60 seconds
      },
    },
  }
);
