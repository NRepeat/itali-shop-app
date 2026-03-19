import { Worker } from 'bullmq';
import { AuditService } from './service/sync/audit.service';
import {
  productSyncQueue,
  orderSyncQueue,
  customerSyncQueue,
} from './service/sync/queues';

const auditService = new AuditService();

// Define a list of all queue names this worker should listen to
const webhookQueueNames = [
  productSyncQueue.name,
  orderSyncQueue.name,
  customerSyncQueue.name,
];

// Worker options
const workerOptions = {
  connection: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
  },
  concurrency: 5, // Process up to 5 jobs at a time
};

export const webhookWorker = new Worker(
  webhookQueueNames,
  async (job) => {
    const { name, data, id } = job;
    try {
      console.log(`Processing job ${id} from queue ${name} with data:`, data);
      
      // name is the queue name (topic like products_update)
      // id is the job id
      await auditService.log(name, id || 'unknown', 'PROCESSING', `Job ${id} started.`);

      // TODO: In future phases, dispatch to specific syncer based on job.name or job.data.topic
      // For now, just simulate success
      await new Promise(resolve => setTimeout(resolve, 500)); // Simulate async work

      await auditService.log(name, id || 'unknown', 'SUCCESS', `Job ${id} completed.`);
      console.log(`Job ${id} from queue ${name} completed successfully.`);
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await auditService.log(name, id || 'unknown', 'FAILURE', `Job ${id} failed: ${errorMessage}`, error);
      console.error(`Job ${id} from queue ${name} failed:`, error);
      throw error; // Re-throw to mark job as failed in BullMQ
    }
  },
  workerOptions,
);

webhookWorker.on('ready', () => {
  console.log(`Webhook worker is ready and listening to queues: ${webhookQueueNames.join(', ')}`);
});

webhookWorker.on('active', (job) => {
  console.log(`Job ${job.id} from queue ${job.name} is now active.`);
});

webhookWorker.on('completed', (job, result) => {
  console.log(`Job ${job.id} from queue ${job.name} completed. Result:`, result);
});

webhookWorker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} from queue ${job?.name} failed with error:`, err);
});

webhookWorker.on('error', (err) => {
  console.error('Webhook worker experienced an error:', err);
});

webhookWorker.on('close', () => {
  console.log('Webhook worker closed.');
});

console.log('Webhook worker startup sequence initiated.');

// Graceful shutdown
const shutdown = async () => {
  console.log('Shutting down webhook worker...');
  await webhookWorker.close();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
