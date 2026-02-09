import type { Job } from "bullmq";
import type { EsputnikOrderJobData } from "@shared/lib/queue/esputnik-order.queue";
import {
  mapShopifyOrderToEsputnik,
  sendOrderToEsputnik,
} from "./esputnik-order.service";

export async function processEsputnikOrderTask(
  job: Job<EsputnikOrderJobData>
): Promise<void> {
  const { payload, status, shop } = job.data;

  console.log(
    `Processing eSputnik order job: ${status} for order ${payload.name || payload.id}`
  );

  try {
    const order = await mapShopifyOrderToEsputnik(payload, status, shop);
    await sendOrderToEsputnik(order);
  } catch (error) {
    console.error(`Error processing eSputnik order job:`, error);
    throw error;
  }
}
