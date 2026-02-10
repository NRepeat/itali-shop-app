import type { Job } from "bullmq";
import type { KeyCrmOrderJobData } from "@shared/lib/queue/keycrm-order.queue";
import { prisma } from "@shared/lib/prisma/prisma.server";
import {
  mapShopifyOrderToKeyCrm,
  createOrderInKeyCrm,
  updateOrderInKeyCrm,
  getKeyCrmStatusId,
} from "./keycrm-order.service";

export async function processKeyCrmOrderTask(
  job: Job<KeyCrmOrderJobData>
): Promise<void> {
  const { payload, status, shop } = job.data;
  const shopifyOrderId = String(payload.id);
  const orderName = String(payload.name || payload.id);

  console.log(
    `Processing keyCRM order job: ${status} for order ${orderName}`
  );

  try {
    if (status === "INITIALIZED") {
      const order = await mapShopifyOrderToKeyCrm(payload, shop);
      const created = await createOrderInKeyCrm(order);

      await prisma.keyCrmOrderMap.create({
        data: {
          shopifyOrderId,
          keycrmOrderId: created.id,
        },
      });

      console.log(
        `Saved keyCRM order mapping: Shopify ${shopifyOrderId} → keyCRM ${created.id}`
      );
    } else {
      const mapping = await prisma.keyCrmOrderMap.findUnique({
        where: { shopifyOrderId },
      });

      if (!mapping) {
        console.warn(
          `No keyCRM order mapping found for Shopify order ${shopifyOrderId}, skipping status update`
        );
        return;
      }

      const statusId = getKeyCrmStatusId(status);
      await updateOrderInKeyCrm(mapping.keycrmOrderId, {
        status_id: statusId,
      });

      console.log(
        `keyCRM order ${mapping.keycrmOrderId} status updated to ${status} (status_id: ${statusId})`
      );
    }
  } catch (error) {
    console.error(`Error processing keyCRM order job:`, error);
    throw error;
  }
}
