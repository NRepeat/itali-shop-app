import { REDIS_CONFIG } from "../config/redis";
import { Queue } from "bullmq";
import Redis from "ioredis";

const connection = new Redis(REDIS_CONFIG.port, REDIS_CONFIG.host, {
  ...REDIS_CONFIG.options,
});
const syncQueue = new Queue("sync-queue", {
  connection,
});

export default syncQueue;
