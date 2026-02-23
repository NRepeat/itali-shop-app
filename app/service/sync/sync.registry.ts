import { productSyncQueue, orderSyncQueue, customerSyncQueue } from './queues';
import { Queue } from 'bullmq';

// Define a type for the known webhook topics and their corresponding queues
type WebhookTopicQueueMap = {
  [key: string]: Queue;
};

// Map Shopify webhook topics to the respective BullMQ queues
const webhookTopicToQueueMap: WebhookTopicQueueMap = {
  // Product topics
  'products/create': productSyncQueue,
  'products/update': productSyncQueue,
  'products/delete': productSyncQueue,

  // Order topics
  'orders/create': orderSyncQueue,
  'orders/updated': orderSyncQueue,
  'orders/cancelled': orderSyncQueue,
  'orders/fulfilled': orderSyncQueue,
  'orders/paid': orderSyncQueue,

  // Customer topics
  'customers/create': customerSyncQueue,
  'customers/update': customerSyncQueue,
  'customers/delete': customerSyncQueue,

  // Add other mappings as needed
};

/**
 * Retrieves the appropriate BullMQ queue for a given webhook topic.
 * @param topic The Shopify webhook topic (e.g., 'products/create').
 * @returns The BullMQ Queue instance or undefined if no mapping is found.
 */
export function getSyncQueue(topic: string): Queue | undefined {
  return webhookTopicToQueueMap[topic];
}
