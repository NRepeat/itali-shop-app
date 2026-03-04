import { Queue } from "bullmq";
import Redis from "ioredis";
import { REDIS_CONFIG } from "../../config/redis";

const connection = new Redis(REDIS_CONFIG.port, REDIS_CONFIG.host, {
  ...REDIS_CONFIG.options,
});

export type EsputnikOrderStatus =
  | "INITIALIZED"      // orders/create → замовлення оформлено
  | "CONFIRMED"        // keyCRM status 3 → підтверджено (replaces INITIALIZED for this event)
  | "IN_PROGRESS"      // keyCRM status 10 → відправлено
  | "DELIVERED"        // keyCRM status 12 → виконано
  | "READY_FOR_PICKUP" // keyCRM status TBD → готово до самовивозу
  | "OUT_OF_STOCK"     // keyCRM status 15 → товару немає в наявності
  | "CANCELLED";       // keyCRM status 19 → скасовано

export interface EsputnikOrderJobData {
  payload: Record<string, any>;
  status: EsputnikOrderStatus;
  shop: string;
  pickupAddress?: string; // passed through for READY_FOR_PICKUP events
  trackingNumber?: string; // passed through for IN_PROGRESS (shipped) events
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
