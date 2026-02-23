import { Queue } from 'bullmq';

// Assuming Redis connection details are available globally or from a config service.
// For now, we'll use a placeholder. In a real app, this would likely come from an environment variable
// or a dedicated configuration module.
const redisConnection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD,
};

export const productSyncQueue = new Queue('productSyncQueue', { connection: redisConnection });
export const orderSyncQueue = new Queue('orderSyncQueue', { connection: redisConnection });
export const customerSyncQueue = new Queue('customerSyncQueue', { connection: redisConnection });
