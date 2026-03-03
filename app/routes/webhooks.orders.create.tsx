import { getSyncQueue } from "@/service/sync/sync.registry";
import { esputnikOrderQueue } from "@shared/lib/queue/esputnik-order.queue";
import { keycrmOrderQueue } from "@shared/lib/queue/keycrm-order.queue";
import { authenticate } from "@/shopify.server";
import { ActionFunctionArgs } from "react-router";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, shop, topic } = await authenticate.webhook(request);

  console.log("Received", topic, "webhook for", shop);

  // Existing: queue for keyCRM sync (webhook.worker.ts)
  const queue = getSyncQueue(topic);
  if (queue) {
    await queue.add(topic, { shop, topic, payload });
  }

  // Queue new order to KeyCRM
  await keycrmOrderQueue.add("keycrm-order-sync", {
    payload,
    status: "INITIALIZED",
    shop,
  });

  // NEW: immediately send "замовлення оформлено" event to Esputnik
  // Uses INITIALIZED status (distinct from CONFIRMED which is keyCRM status 3)
  await esputnikOrderQueue.add("esputnik-order-sync", {
    payload,
    status: "INITIALIZED",
    shop,
  });

  return new Response(null, { status: 200 });
};
