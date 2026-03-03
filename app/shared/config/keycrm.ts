import type { EsputnikOrderStatus } from "@shared/lib/queue/esputnik-order.queue";

const apiKey = process.env.KEYCRM_API_KEY;
const sourceId = process.env.KEYCRM_SOURCE_ID;

if (!apiKey) {
  throw new Error("KEYCRM_API_KEY environment variable is required");
}

if (!sourceId) {
  throw new Error("KEYCRM_SOURCE_ID environment variable is required");
}

export const KEYCRM_CONFIG = {
  baseUrl: "https://openapi.keycrm.app/v1",
  authHeader: `Bearer ${apiKey}`,
  sourceId: Number(sourceId),
  // Shopify → keyCRM (outbound)
  statuses: {
    new: 1,
    confirmed: 3,
    shipped: 10,
    cancelled: 19,
  },

  // keyCRM → Shopify (inbound webhook mapping)
  paidStatusIds: [3, 21] as number[],           // Підтверджено, Оплачено → mark as paid
  fulfillStatusIds: [12] as number[],           // Виконано → fulfill order
  closeStatusIds: [12] as number[],             // Виконано → close order
  cancelStatusIds: [18, 19, 20, 15, 13, 14, 16, 17] as number[], // All canceled group → cancel

  // keyCRM → eSputnik (status_id → eSputnik event)
  esputnikStatusMap: {
    3:  "CONFIRMED",    // Підтверджено (was INITIALIZED — changed to avoid double-send with orders/create)
    10: "IN_PROGRESS",  // Відправлено
    12: "DELIVERED",    // Виконано
    19: "CANCELLED",    // Скасовано
    15: "OUT_OF_STOCK", // Немає в наявності (was CANCELLED — now has distinct email)
    // READY_FOR_PICKUP: add keyCRM status ID when known from keyCRM admin panel
  } as Record<number, EsputnikOrderStatus>
};
