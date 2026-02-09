import { Queue } from "bullmq";
import Redis from "ioredis";
import { REDIS_CONFIG } from "../../config/redis";

const connection = new Redis(REDIS_CONFIG.port, REDIS_CONFIG.host, {
  ...REDIS_CONFIG.options,
});

export type EsputnikOrderStatus =
  | "INITIALIZED"
  | "IN_PROGRESS"
  | "DELIVERED"
  | "CANCELLED";

export interface EsputnikOrderJobData {
  payload: Record<string, any>;
  status: EsputnikOrderStatus;
  shop: string;
}

export const esputnikOrderQueue = new Queue<EsputnikOrderJobData>(
  "esputnik-order-queue",
  {
    connection,
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 500,
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 5000,
      },
    },
  }
);
