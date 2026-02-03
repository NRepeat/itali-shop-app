import type { Job } from "bullmq";
import type { PriceNotificationJobData } from "@shared/lib/queue/price-notification.queue";
import { sendPriceNotificationEmail } from "./price-notification.service";

export async function processPriceNotificationTask(
  job: Job<PriceNotificationJobData>
): Promise<void> {
  const { subscriptionId, email } = job.data;

  console.log(
    `Processing price notification for subscription ${subscriptionId} (${email})`
  );

  try {
    await sendPriceNotificationEmail(job.data);
    console.log(`Successfully sent notification for subscription ${subscriptionId}`);
  } catch (error) {
    console.error(`Error sending notification for subscription ${subscriptionId}:`, error);
    throw error; // Re-throw to trigger BullMQ retry
  }
}
