import { Queue } from "bullmq";
import Redis from "ioredis";
import { REDIS_CONFIG } from "../../config/redis";

const connection = new Redis(REDIS_CONFIG.port, REDIS_CONFIG.host, {
  ...REDIS_CONFIG.options,
});

export type KeyCrmOrderStatus =
  | "INITIALIZED"
  | "IN_PROGRESS"
  | "DELIVERED"
  | "CANCELLED";

export interface KeyCrmOrderJobData {
  payload: Record<string, any>;
  status: KeyCrmOrderStatus;
  shop: string;
}

export const keycrmOrderQueue = new Queue<KeyCrmOrderJobData>(
  "keycrm-order-queue",
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
