import { Worker } from "bullmq";
import Redis from "ioredis";
import { REDIS_CONFIG } from "./shared/config/redis";
import { processPriceNotificationTask } from "./service/price-tracking/price-notification.worker";
import { processPendingNotifications } from "./service/price-tracking/price-notification.service";

const connection = new Redis(REDIS_CONFIG.port, REDIS_CONFIG.host, {
  ...REDIS_CONFIG.options,
});

// Worker for processing notification queue
const notificationWorker = new Worker(
  "price-notification-queue",
  processPriceNotificationTask,
  {
    connection,
    concurrency: 5,
  }
);

notificationWorker.on("completed", (job) => {
  console.log(
    `Notification job ${job.id} completed for ${job.data.email}`
  );
});

notificationWorker.on("failed", (job, err) => {
  console.error(
    `Notification job ${job?.id} failed with error: ${err.message}`
  );
});

notificationWorker.on("error", (err) => {
  console.error("Notification worker error:", err);
});

// Periodic check for pending notifications (every 5 minutes)
const POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes

async function pollPendingNotifications() {
  try {
    const count = await processPendingNotifications();
    if (count > 0) {
      console.log(`Queued ${count} pending notifications`);
    }
  } catch (error) {
    console.error("Error polling pending notifications:", error);
  }
}

// Start polling
setInterval(pollPendingNotifications, POLL_INTERVAL);

// Initial poll on startup
pollPendingNotifications();

console.log(
  "Price Notification Worker is running and listening for price-notification-queue jobs..."
);
console.log(`Polling for pending notifications every ${POLL_INTERVAL / 1000} seconds`);
