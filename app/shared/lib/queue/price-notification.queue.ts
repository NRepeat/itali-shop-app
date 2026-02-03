import { Queue } from "bullmq";
import Redis from "ioredis";
import { REDIS_CONFIG } from "../../config/redis";

const connection = new Redis(REDIS_CONFIG.port, REDIS_CONFIG.host, {
  ...REDIS_CONFIG.options,
});

export interface PriceNotificationJobData {
  subscriptionId: string;
  email: string;
  shopifyProductId: string;
  shopifyVariantId: string | null;
  currentPrice: string;
  targetPrice: string | null;
  productTitle?: string;
  variantTitle?: string;
}

export const priceNotificationQueue = new Queue<PriceNotificationJobData>(
  "price-notification-queue",
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
