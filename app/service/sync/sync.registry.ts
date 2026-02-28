import { productSyncQueue, orderSyncQueue, customerSyncQueue } from "./queues";
import { collectionSyncQueue } from "@shared/lib/queue/collection-sync.queue";
import { Queue } from "bullmq";

// Define a type for the known webhook topics and their corresponding queues
type WebhookTopicQueueMap = {
  [key: string]: Queue;
};

// Map Shopify webhook topics to the respective BullMQ queues
const webhookTopicToQueueMap: WebhookTopicQueueMap = {
  // Product topics
  products_create: productSyncQueue,
  products_update: productSyncQueue,
  products_delete: productSyncQueue,

  // _ Order topics
  orders_create: orderSyncQueue,
  orders_updated: orderSyncQueue,
  orders_cancelled: orderSyncQueue,
  orders_fulfilled: orderSyncQueue,
  orders_paid: orderSyncQueue,

  // _ Customer topics
  customers_create: customerSyncQueue,
  customers_update: customerSyncQueue,
  customers_delete: customerSyncQueue,

  // Collection topics
  collections_create: collectionSyncQueue,
  collections_update: collectionSyncQueue,
  collections_delete: collectionSyncQueue,

  // Add other mappings as needed
};

/**
 * Retrieves the appropriate BullMQ queue for a given webhook topic.
 * @param topic The Shopify webhook topic (e.g., 'products/create').
 * @returns The BullMQ Queue instance or undefined if no mapping is found.
 */
export function getSyncQueue(topic: string): Queue | undefined {
  console.log(`Getting sync queue for topic: ${topic}`);
  const existTopic = webhookTopicToQueueMap[topic.toLowerCase()];

  if (existTopic) {
    return webhookTopicToQueueMap[topic.toLowerCase()];
  } else {
    return undefined;
  }
}
