import { Worker } from 'bullmq';
import { AuditService } from './service/sync/audit.service';
// Placeholder for queues, will be defined in app/service/sync/queues.ts
import { REDIS_CONNECTION } from './shared/config/redis.config';

const auditService = new AuditService();

// Placeholder for queue names - these will be imported from queues.ts later
export const WEBHOOK_QUEUE_NAMES = {
  PRODUCT: 'productSyncQueue',
  ORDER: 'orderSyncQueue',
  CUSTOMER: 'customerSyncQueue',
};

const webhookWorker = new Worker(
  Object.values(WEBHOOK_QUEUE_NAMES),
  async (job) => {
    const { name, data } = job;
    console.log(`Processing job ${job.id} from queue ${name} with data:`, data);

    try {
      await auditService.log(
        name, // entityType - using job name as a proxy for now
        data.admin_graphql_api_id || data.id, // entityId - trying to get Shopify ID
        'PROCESSING',
        `Started processing webhook for topic: ${name}, entity ID: ${data.admin_graphql_api_id || data.id}`,
      );

      // In later phases, this is where the job will be dispatched to the appropriate syncer.
      // For now, we just simulate success.
      console.log(`Successfully processed job ${job.id} for topic: ${name}`);

      await auditService.log(
        name,
        data.admin_graphql_api_id || data.id,
        'SUCCESS',
        `Finished processing webhook for topic: ${name}, entity ID: ${data.admin_graphql_api_id || data.id}`,
      );
    } catch (error: any) {
      console.error(`Error processing job ${job.id} for topic ${name}:`, error);
      await auditService.log(
        name,
        data.admin_graphql_api_id || data.id,
        'FAILURE',
        `Failed to process webhook for topic: ${name}, error: ${error.message}`,
        error,
      );
      throw error; // Re-throw to mark job as failed in BullMQ
    }
  },
  {
    connection: REDIS_CONNECTION,
    concurrency: 5, // Example concurrency, can be configured
    // Other global worker options can be added here
  },
);

webhookWorker.on('completed', (job) => {
  console.log(`Job ${job.id} has completed!`);
});

webhookWorker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} has failed with error ${err.message}`);
});

console.log('Webhook worker started, listening for jobs...');

export default webhookWorker;
