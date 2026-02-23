import { Worker, JobsOptions } from 'bullmq';
import { AuditService } from '../service/sync/audit.service';
import {
  productSyncQueue,
  orderSyncQueue,
  customerSyncQueue,
} from '../service/sync/queues';

const auditService = new AuditService();

// Define a list of all queue names this worker should listen to
const webhookQueueNames = [
  productSyncQueue.name,
  orderSyncQueue.name,
  customerSyncQueue.name,
];

// Worker options
const workerOptions = {
  connection: productSyncQueue.opts.connection, // Use the same connection as the queues
  concurrency: 5, // Process up to 5 jobs at a time
};

export const webhookWorker = new Worker(
  webhookQueueNames,
  async (job) => {
    const { name, data, id } = job;
    try {
      console.log(`Processing job ${id} from queue ${name} with data:`, data);
      await auditService.log(id || 'unknown', name, 'PROCESSING', `Job ${id} started.`);

      // TODO: In future phases, dispatch to specific syncer based on job.name or job.data.topic
      // For now, just simulate success
      await new Promise(resolve => setTimeout(resolve, 500)); // Simulate async work

      await auditService.log(id || 'unknown', name, 'SUCCESS', `Job ${id} completed.`);
      console.log(`Job ${id} from queue ${name} completed successfully.`);
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await auditService.log(id || 'unknown', name, 'FAILURE', `Job ${id} failed: ${errorMessage}`);
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
  // Log any worker errors
  console.error('Webhook worker experienced an error:', err);
});

webhookWorker.on('close', () => {
  console.log('Webhook worker closed.');
});

// To keep the worker running, we might need to explicitly call .run()
// However, in a Remix app, this typically runs as part of the server process.
// For now, simply exporting it is sufficient for instantiation.
