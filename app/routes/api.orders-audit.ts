// GET /api/orders-audit
// Compares local external DB orders vs OrderMap (synced to Shopify)
// Returns breakdown: synced, skipped (no products), failed/pending

import { prisma, externalDB } from "@shared/lib/prisma/prisma.server";
import type { LoaderFunctionArgs } from "react-router";

export const loader = async (_: LoaderFunctionArgs) => {
  const [allOrders, orderProducts, orderMaps] = await Promise.all([
    externalDB.bc_order.findMany({
      select: { order_id: true, order_status_id: true },
      orderBy: { order_id: "asc" },
    }),
    externalDB.bc_order_product.findMany({
      select: { order_id: true },
    }),
    prisma.orderMap.findMany({
      select: { localOrderId: true, shopifyOrderId: true },
    }),
  ]);

  const syncedIds = new Map(orderMaps.map((m) => [m.localOrderId, m.shopifyOrderId]));
  const orderIdsWithProducts = new Set(orderProducts.map((p) => p.order_id));

  const synced: number[] = [];
  const noProducts: number[] = [];
  const notSynced: Array<{ order_id: number; order_status_id: number }> = [];

  for (const order of allOrders) {
    if (syncedIds.has(order.order_id)) {
      synced.push(order.order_id);
    } else if (!orderIdsWithProducts.has(order.order_id)) {
      noProducts.push(order.order_id);
    } else {
      notSynced.push({ order_id: order.order_id, order_status_id: order.order_status_id });
    }
  }

  // Group not-synced by status
  const notSyncedByStatus: Record<number, number> = {};
  for (const o of notSynced) {
    notSyncedByStatus[o.order_status_id] = (notSyncedByStatus[o.order_status_id] ?? 0) + 1;
  }

  return Response.json({
    summary: {
      total: allOrders.length,
      synced: synced.length,
      noProducts: noProducts.length,
      notSynced: notSynced.length,
    },
    notSyncedByStatus,
    // First 100 not-synced order IDs for inspection
    notSyncedSample: notSynced.slice(0, 100).map((o) => o.order_id),
    noProductsSample: noProducts.slice(0, 50),
  });
};
