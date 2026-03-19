import { productSyncQueue, orderSyncQueue, customerSyncQueue, googleMerchantSyncQueue } from "./queues";
import { collectionSyncQueue } from "@shared/lib/queue/collection-sync.queue";
import { Queue } from "bullmq";

// Define a type for the known webhook topics and their corresponding queues
type WebhookTopicQueueMap = {
  [key: string]: Queue[];
};

// Map Shopify webhook topics to the respective BullMQ queues
const webhookTopicToQueueMap: WebhookTopicQueueMap = {
  // Product topics
  products_create: [productSyncQueue, googleMerchantSyncQueue],
  products_update: [productSyncQueue, googleMerchantSyncQueue],
  products_delete: [productSyncQueue, googleMerchantSyncQueue],

  // _ Order topics
  orders_create: [orderSyncQueue],
  orders_updated: [orderSyncQueue],
  orders_cancelled: [orderSyncQueue],
  orders_fulfilled: [orderSyncQueue],
  orders_paid: [orderSyncQueue],

  // _ Customer topics
  customers_create: [customerSyncQueue],
  customers_update: [customerSyncQueue],
  customers_delete: [customerSyncQueue],

  // Collection topics
  collections_create: [collectionSyncQueue],
  collections_update: [collectionSyncQueue],
  collections_delete: [collectionSyncQueue],

  // Add other mappings as needed
};

/**
 * Retrieves the appropriate BullMQ queues for a given webhook topic.
 * @param topic The Shopify webhook topic (e.g., 'products/create').
 * @returns An array of BullMQ Queue instances.
 */
export function getSyncQueues(topic: string): Queue[] {
  console.log(`Getting sync queues for topic: ${topic}`);
  const formattedTopic = topic.replace("/", "_").toLowerCase();
  return webhookTopicToQueueMap[formattedTopic] || [];
}
