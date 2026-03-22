import { KEYCRM_CONFIG } from "@shared/config/keycrm";
import { prisma } from "@shared/lib/prisma/prisma.server";
import { client } from "../sync/client/shopify";
import { esputnikOrderQueue } from "@shared/lib/queue/esputnik-order.queue";
import { fetchKeyCrmOrderTracking } from "./keycrm-order.service";
import { posthog } from "@shared/lib/posthog/posthog.server";
import type { FulfillmentInput, OrderCloseInput } from "@/types";

interface KeyCrmWebhookPayload {
  event: string;
  context: {
    id: number;
    source_uuid?: string | null;
    source_id?: number;
    status_id: number;
    status_group_id?: number;
    payment_status?: string;
    grand_total?: number;
    client_id?: number;
    created_at?: string;
    updated_at?: string;
    status_changed_at?: string;
    shipping?: {
      tracking_code?: string | null;
      tracking_status?: string | null;
      [key: string]: any;
    } | null;
    [key: string]: any;
  };
}

// --- GraphQL queries & mutations ---

const GET_ORDER_QUERY = `
  query getOrder($orderId: ID!) {
    order(id: $orderId) {
      id
      name
      email
      phone
      createdAt
      totalPriceSet { shopMoney { amount currencyCode } }
      totalDiscountsSet { shopMoney { amount } }
      currentSubtotalLineItemsQuantity
      paymentGatewayNames
      customer { firstName lastName email phone }
      shippingAddress {
        address1 address2 city province zip country
      }
      lineItems(first: 50) {
        nodes {
          title variantTitle quantity sku
          originalUnitPriceSet { shopMoney { amount } }
          product { id vendor productType }
          variant { id }
          image { url }
        }
      }
      shippingLines(first: 5) {
        nodes { title originalPriceSet { shopMoney { amount } } }
      }
    }
  }
`;

const ORDER_MARK_AS_PAID_MUTATION = `
  mutation orderMarkAsPaid($input: OrderMarkAsPaidInput!) {
    orderMarkAsPaid(input: $input) {
      order { id }
      userErrors { field message }
    }
  }
`;

const FULFILLMENT_ORDER_QUERY = `
  query getFulfillmentOrders($orderId: ID!) {
    order(id: $orderId) {
      fulfillmentOrders(first: 10) {
        nodes {
          id
          status
          lineItems(first: 50) {
            nodes {
              id
              remainingQuantity
            }
          }
        }
      }
    }
  }
`;

const FULFILLMENT_CREATE_MUTATION = `#graphql
  mutation fulfillmentCreate($fulfillment: FulfillmentInput!) {
    fulfillmentCreate(fulfillment: $fulfillment) {
      fulfillment { id status }
      userErrors { field message }
    }
  }
`;

const ORDER_CLOSE_MUTATION = `
  mutation orderClose($input: OrderCloseInput!) {
    orderClose(input: $input) {
      order { id }
      userErrors { field message }
    }
  }
`;

const ORDER_CANCEL_MUTATION = `
  mutation orderCancel($orderId: ID!, $reason: OrderCancelReason!, $notifyCustomer: Boolean!, $refund: Boolean!, $restock: Boolean!) {
    orderCancel(orderId: $orderId, reason: $reason, notifyCustomer: $notifyCustomer, refund: $refund, restock: $restock) {
      orderCancelUserErrors { field message }
    }
  }
`;

// # DEPLOYMENT BLOCKER
// PICKUP_ADDRESS_MAP is intentionally empty. The keyCRM status IDs for "готово до самовивозу"
// (READY_FOR_PICKUP) are unknown and must be confirmed in the keyCRM admin panel before go-live.
// Without these entries, READY_FOR_PICKUP events will fire with no pickupAddress, and the
// "готово до самовивозу" email template's $!data.get('pickupAddress') will render blank.
//
// ACTION REQUIRED before deploying to production:
//   1. Open keyCRM admin panel → Settings → Order Statuses
//   2. Find the status ID(s) for each "готово до самовивозу" store location
//   3. Add entries below, one per store, keyed by that status ID:
//      Example: 25: "пр Соборний 186, м. Запоріжжя (Mio Mio)"
//
// Known store addresses to map:
//   - Mio Mio — пр Соборний 186, м. Запоріжжя
//   - Mio Mio Best — пр Соборний 189, м. Запоріжжя
//   - Світлана — пр Соборний 92 (ТР Верже), м. Запоріжжя
//   - Світлана — пр Соборний 189, м. Запоріжжя
const PICKUP_ADDRESS_MAP: Record<number, string> = {
  // Add entries here once keyCRM status IDs are confirmed (see DEPLOYMENT BLOCKER above)
};

// --- Helpers ---

function graphqlOrderToWebhookPayload(order: any): Record<string, any> {
  const numericId = order.id.replace("gid://shopify/Order/", "");
  return {
    id: numericId,
    name: order.name,
    email: order.email,
    phone: order.phone,
    created_at: order.createdAt,
    total_price: order.totalPriceSet?.shopMoney?.amount || "0",
    currency: order.totalPriceSet?.shopMoney?.currencyCode || "UAH",
    total_discounts: order.totalDiscountsSet?.shopMoney?.amount || "0",
    payment_gateway: order.paymentGatewayNames?.[0] ?? null,
    customer: order.customer
      ? {
          first_name: order.customer.firstName,
          last_name: order.customer.lastName,
          email: order.customer.email,
          phone: order.customer.phone,
        }
      : null,
    shipping_address: order.shippingAddress,
    line_items: (order.lineItems?.nodes || []).map((item: any) => ({
      title: item.title,
      variant_title: item.variantTitle,
      quantity: item.quantity,
      sku: item.sku,
      price: item.originalUnitPriceSet?.shopMoney?.amount || "0",
      product_id: item.product?.id?.replace("gid://shopify/Product/", ""),
      variant_id: item.variant?.id?.replace("gid://shopify/ProductVariant/", ""),
      vendor: item.product?.vendor || null,
      product_type: item.product?.productType || null,
      image: item.image ? { src: item.image.url } : null,
    })),
    shipping_lines: (order.shippingLines?.nodes || []).map((line: any) => ({
      title: line.title,
      price: line.originalPriceSet?.shopMoney?.amount || "0",
    })),
  };
}

async function getShopAndToken(): Promise<{
  shop: string;
  accessToken: string;
}> {
  const session = await prisma.session.findFirst({
    where: { isOnline: false },
    select: { shop: true, accessToken: true },
  });

  if (!session?.accessToken) {
    throw new Error("No offline session found for Shopify API access");
  }

  return { shop: session.shop, accessToken: session.accessToken };
}

function gqlOrderId(shopifyOrderId: string): string {
  return `gid://shopify/Order/${shopifyOrderId}`;
}

// --- Shopify actions (GraphQL only) ---

async function markOrderAsPaid(
  shopifyOrderId: string,
  shop: string,
  accessToken: string
): Promise<void> {
  const result = await client.request<
    { orderMarkAsPaid: { userErrors: Array<{ field: string; message: string }> } },
    { input: { id: string } }
  >({
    query: ORDER_MARK_AS_PAID_MUTATION,
    variables: { input: { id: gqlOrderId(shopifyOrderId) } },
    accessToken,
    shopDomain: shop,
  });

  const errors = result.orderMarkAsPaid?.userErrors || [];
  if (errors.length > 0) {
    const msg = errors.map((e) => e.message).join(", ");
    // Order already paid (e.g. via LiqPay) — not an error
    if (msg.toLowerCase().includes('cannot be marked') || msg.toLowerCase().includes('already')) {
      console.log(`Shopify order ${shopifyOrderId} already paid, skipping`);
      return;
    }
    throw new Error(`orderMarkAsPaid failed: ${msg}`);
  }

  console.log(`Shopify order ${shopifyOrderId} marked as paid`);
}

async function fulfillOrder(
  shopifyOrderId: string,
  shop: string,
  accessToken: string,
  trackingNumber?: string
): Promise<void> {
  const orderId = gqlOrderId(shopifyOrderId);

  const data = await client.request<
    {
      order: {
        fulfillmentOrders: {
          nodes: Array<{
            id: string;
            status: string;
            lineItems: { nodes: Array<{ id: string; remainingQuantity: number }> };
          }>;
        };
      };
    },
    { orderId: string }
  >({
    query: FULFILLMENT_ORDER_QUERY,
    variables: { orderId },
    accessToken,
    shopDomain: shop,
  });

  const fulfillmentOrders = data.order?.fulfillmentOrders?.nodes || [];
  console.log(
    `Shopify order ${shopifyOrderId} has ${fulfillmentOrders.length} fulfillment order(s): ${fulfillmentOrders.map((fo) => `${fo.id} [${fo.status}]`).join(", ") || "none"}`
  );
  const openOrders = fulfillmentOrders.filter(
    (fo) => fo.status === "OPEN" || fo.status === "IN_PROGRESS"
  );

  if (openOrders.length === 0) {
    console.log(
      `No open fulfillment orders for Shopify order ${shopifyOrderId}, may already be fulfilled`
    );
    return;
  }

  for (const fo of openOrders) {
    const lineItems = fo.lineItems.nodes
      .filter((li) => li.remainingQuantity > 0)
      .map((li) => ({ id: li.id, quantity: li.remainingQuantity }));

    if (lineItems.length === 0) {
      console.log(`Fulfillment order ${fo.id} has no remaining line items, skipping`);
      continue;
    }
    console.log(
      `Creating fulfillment for order ${shopifyOrderId}, fulfillment order ${fo.id}, ${lineItems.length} line item(s)${trackingNumber ? `, tracking: ${trackingNumber}` : ""}`
    );

    const result = await client.request<
      {
        fulfillmentCreate: {
          fulfillment: { id: string; status: string } | null;
          userErrors: Array<{ field: string; message: string }>;
        };
      },
      { fulfillment: FulfillmentInput }
    >({
      query: FULFILLMENT_CREATE_MUTATION,
      variables: {
        fulfillment: {
          notifyCustomer: false,
          lineItemsByFulfillmentOrder: [
            {
              fulfillmentOrderId: fo.id,
              fulfillmentOrderLineItems: lineItems,
            },
          ],
          ...(trackingNumber && { trackingInfo: { number: trackingNumber } }),
        },
      },
      accessToken,
      shopDomain: shop,
    });

    const errors = result.fulfillmentCreate?.userErrors || [];
    if (errors.length > 0) {
      throw new Error(`fulfillmentCreate failed: ${errors.map((e) => e.message).join(", ")}`);
    }

    console.log(`Fulfillment created for Shopify order ${shopifyOrderId}`);
  }
}

async function closeOrder(
  shopifyOrderId: string,
  shop: string,
  accessToken: string
): Promise<void> {
  const result = await client.request<
    { orderClose: { userErrors: Array<{ field: string; message: string }> } },
    { input:OrderCloseInput}
  >({
    query: ORDER_CLOSE_MUTATION,
    variables: { input: { id: gqlOrderId(shopifyOrderId), } },
    accessToken,
    shopDomain: shop,
  });

  const errors = result.orderClose?.userErrors || [];
  if (errors.length > 0) {
    throw new Error(`orderClose failed: ${errors.map((e) => e.message).join(", ")}`);
  }

  console.log(`Shopify order ${shopifyOrderId} closed`);
}

async function cancelOrder(
  shopifyOrderId: string,
  shop: string,
  accessToken: string
): Promise<void> {
  const result = await client.request<
    { orderCancel: { orderCancelUserErrors: Array<{ field: string; message: string }> } },
    { orderId: string; reason: string; notifyCustomer: boolean; refund: boolean; restock: boolean }
  >({
    query: ORDER_CANCEL_MUTATION,
    variables: {
      orderId: gqlOrderId(shopifyOrderId),
      reason: "OTHER",
      notifyCustomer: false,
      refund: false,
      restock: true,
    },
    accessToken,
    shopDomain: shop,
  });

  const errors = result.orderCancel?.orderCancelUserErrors || [];
  if (errors.length > 0) {
    throw new Error(`orderCancel failed: ${errors.map((e) => e.message).join(", ")}`);
  }

  console.log(`Shopify order ${shopifyOrderId} cancelled`);
}

// --- Main handler ---

export async function handleKeyCrmOrderStatusChange(
  payload: KeyCrmWebhookPayload
): Promise<void> {
  const { context } = payload;
  const keycrmOrderId = context.id;
  const statusId = context.status_id;

  console.log(
    `keyCRM webhook: order ${keycrmOrderId} status changed to ${statusId}, payment_status=${context.payment_status}, full_context=${JSON.stringify(context)}`
  );

  const mapping = await prisma.keyCrmOrderMap.findUnique({
    where: { keycrmOrderId },
  });

  if (!mapping) {
    console.warn(
      `No mapping found for keyCRM order ${keycrmOrderId}, skipping`
    );
    return;
  }

  console.log(
    `keyCRM order ${keycrmOrderId} mapped to Shopify order ${mapping.shopifyOrderId}`
  );

  // Trigger LiqPay hold_completion when manager confirms a LiqPay order
  // Only fire for LiqPay payments — other methods (bank transfer, COD) have no hold to capture
  // paymentMethod is saved in KeyCrmOrderMap at order creation time from Shopify's payment_gateway_names
  const isLiqpayOrder = mapping.paymentMethod === 'liqpay';
  if (statusId === KEYCRM_CONFIG.statuses.confirmed && isLiqpayOrder) {
    const nnshopUrl = process.env.NEXT_APP_URL || "https://www.miomio.com.ua";
    const secret = process.env.INTERNAL_API_SECRET;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (secret) headers["Authorization"] = `Bearer ${secret}`;
    console.log(`[keyCRM webhook] triggering LiqPay capture for ${mapping.shopifyOrderId}`);
    fetch(`${nnshopUrl}/api/liqpay/capture`, {
      method: "POST",
      headers,
      body: JSON.stringify({ shopifyOrderId: mapping.shopifyOrderId }),
    })
      .then((r) => console.log(`[keyCRM webhook] capture triggered for ${mapping.shopifyOrderId}: ${r.status}`))
      .catch((err) => console.error(`[keyCRM webhook] capture failed:`, err));
  } else if (statusId === KEYCRM_CONFIG.statuses.confirmed) {
    console.log(`[keyCRM webhook] order ${mapping.shopifyOrderId} is not LiqPay — skipping capture`);
  }

  const { shop, accessToken } = await getShopAndToken();
  console.log(`Using Shopify session for shop: ${shop}`);
  const shopifyOrderId = mapping.shopifyOrderId;

  // Fetch tracking number from keyCRM API — the webhook does not include it reliably.
  // Only needed when status maps to IN_PROGRESS (ВІДПРАВЛЕНО).
  let trackingNumber: string | undefined;
  const esputnikStatusForTracking = KEYCRM_CONFIG.esputnikStatusMap[statusId];
  if (esputnikStatusForTracking === "IN_PROGRESS") {
    try {
      trackingNumber = await fetchKeyCrmOrderTracking(keycrmOrderId);
      if (trackingNumber) {
        console.log(`keyCRM order ${keycrmOrderId} tracking code: ${trackingNumber}`);
      } else {
        console.log(`keyCRM order ${keycrmOrderId} has no tracking code yet`);
      }
    } catch (err) {
      console.warn(`Failed to fetch tracking code for keyCRM order ${keycrmOrderId}:`, err);
    }
  }

  // Fetch order data if needed for eSputnik or PostHog
  const esputnikStatus = KEYCRM_CONFIG.esputnikStatusMap[statusId];
  const needsOrderData =
    !!esputnikStatus ||
    KEYCRM_CONFIG.paidStatusIds.includes(statusId) ||
    KEYCRM_CONFIG.closeStatusIds.includes(statusId) ||
    KEYCRM_CONFIG.cancelStatusIds.includes(statusId);

  console.log(
    `Status ${statusId} → esputnik: ${esputnikStatus ?? "none"}, paid: ${KEYCRM_CONFIG.paidStatusIds.includes(statusId)}, fulfill: ${KEYCRM_CONFIG.fulfillStatusIds.includes(statusId)}, close: ${KEYCRM_CONFIG.closeStatusIds.includes(statusId)}, cancel: ${KEYCRM_CONFIG.cancelStatusIds.includes(statusId)}`
  );

  let order: any = null;
  let webhookPayload: Record<string, any> | null = null;

  if (needsOrderData) {
    console.log(`Fetching Shopify order data for order ${shopifyOrderId}`);
    const orderData = await client.request<{ order: any }, { orderId: string }>({
      query: GET_ORDER_QUERY,
      variables: { orderId: gqlOrderId(shopifyOrderId) },
      accessToken,
      shopDomain: shop,
    });
    order = orderData.order;
    webhookPayload = graphqlOrderToWebhookPayload(order);
    console.log(
      `Shopify order ${shopifyOrderId} fetched: ${order?.name}, total: ${webhookPayload?.total_price} ${webhookPayload?.currency}`
    );
  }

  // PostHog identify + capture helper
  const capturePostHog = (event: string, extra?: Record<string, any>) => {
    if (!posthog || !webhookPayload) return;
    const email =
      webhookPayload.customer?.email ||
      webhookPayload.email;
    const distinctId = email || `order_${shopifyOrderId}`;

    if (email) {
      posthog.identify({
        distinctId,
        properties: {
          email,
          name: [webhookPayload.customer?.first_name, webhookPayload.customer?.last_name]
            .filter(Boolean)
            .join(" ") || undefined,
          phone: webhookPayload.customer?.phone || webhookPayload.phone || undefined,
        },
      });
    }

    const lineItems: any[] = webhookPayload.line_items ?? [];
    const brands = [...new Set(lineItems.map((i: any) => i.vendor).filter(Boolean))];
    const categories = [...new Set(lineItems.map((i: any) => i.product_type).filter(Boolean))];

    posthog.capture({
      distinctId,
      event,
      properties: {
        $revenue: parseFloat(webhookPayload.total_price),
        revenue: parseFloat(webhookPayload.total_price),
        currency: webhookPayload.currency,
        order_id: webhookPayload.name,
        shopify_order_id: shopifyOrderId,
        items_count: lineItems.length,
        discount_amount: parseFloat(webhookPayload.total_discounts ?? "0"),
        payment_method: webhookPayload.payment_gateway,
        keycrm_status_id: statusId,
        brands,
        categories,
        items: lineItems.map((i: any) => ({
          title: i.title,
          vendor: i.vendor,
          product_type: i.product_type,
          sku: i.sku,
          quantity: i.quantity,
          price: parseFloat(i.price ?? "0"),
        })),
        ...extra,
      },
    });
    console.log(`PostHog ${event} sent for order ${shopifyOrderId}`);
  };

  // PostHog event map driven by esputnikStatusMap
  // Covers: 3→order_confirmed, 10→order_shipped, 12→order_completed,
  //         15→order_out_of_stock, 18/19→order_cancelled, READY_FOR_PICKUP→order_ready_for_pickup
  const posthogEventMap: Record<string, string> = {
    CONFIRMED: "order_confirmed",
    IN_PROGRESS: "order_shipped",
    DELIVERED: "order_completed",
    CANCELLED: "order_cancelled",
    OUT_OF_STOCK: "order_out_of_stock",
    READY_FOR_PICKUP: "order_ready_for_pickup",
  };

  // 1. eSputnik event (Підтверджено, Відправлено, Виконано, Скасовано, Немає в наявності)
  if (esputnikStatus && webhookPayload) {
    console.log(
      `keyCRM status ${statusId} → sending ${esputnikStatus} to eSputnik for order ${shopifyOrderId}`
    );

    const pickupAddress = esputnikStatus === "READY_FOR_PICKUP"
      ? PICKUP_ADDRESS_MAP[statusId]
      : undefined;

    await esputnikOrderQueue.add("esputnik-order-sync", {
      payload: webhookPayload,
      status: esputnikStatus,
      shop,
      ...(pickupAddress && { pickupAddress }),
      ...(trackingNumber && { trackingNumber }),
    });

    console.log(
      `eSputnik ${esputnikStatus} event queued for order ${shopifyOrderId}`
    );

    // PostHog: fire event for this esputnik status
    const posthogEvent = posthogEventMap[esputnikStatus];
    if (posthogEvent) {
      capturePostHog(posthogEvent, ...(trackingNumber ? [{ tracking_number: trackingNumber }] : []));
    }

    // GA4 Measurement Protocol: fire purchase when order is completed (Виконано, status 12).
    // Single revenue confirmation point for all payment methods.
    if (KEYCRM_CONFIG.closeStatusIds.includes(statusId) && webhookPayload) {
      const nnshopUrl = process.env.NEXT_APP_URL || "https://www.miomio.com.ua";
      const secret = process.env.INTERNAL_API_SECRET;
      const ga4Headers: Record<string, string> = { "Content-Type": "application/json" };
      if (secret) ga4Headers["Authorization"] = `Bearer ${secret}`;
      fetch(`${nnshopUrl}/api/internal/ga4-purchase`, {
        method: "POST",
        headers: ga4Headers,
        body: JSON.stringify({
          orderName: webhookPayload.name,
          amount: parseFloat(webhookPayload.total_price),
          currency: webhookPayload.currency,
        }),
      }).catch((err) => console.error("[keyCRM] GA4 purchase call failed:", err));
    }
  }

  // 2. Shopify actions
  // Skip markOrderAsPaid for LiqPay confirmed orders — /api/liqpay/capture handles it
  const skipMarkAsPaid = isLiqpayOrder && statusId === KEYCRM_CONFIG.statuses.confirmed;
  if (KEYCRM_CONFIG.paidStatusIds.includes(statusId) && !skipMarkAsPaid) {
    console.log(
      `Marking Shopify order ${shopifyOrderId} as paid (keyCRM status: ${statusId})`
    );
    await markOrderAsPaid(shopifyOrderId, shop, accessToken);

    // PostHog: fire order_confirmed for paid statuses without esputnik mapping (e.g. status 21)
    if (!esputnikStatus) {
      capturePostHog("order_confirmed");
    }
  } else if (skipMarkAsPaid) {
    console.log(`[keyCRM webhook] skipping markOrderAsPaid for ${shopifyOrderId} — handled by liqpay/capture`);
  }

  if (KEYCRM_CONFIG.fulfillStatusIds.includes(statusId)) {
    console.log(
      `Fulfilling Shopify order ${shopifyOrderId} (keyCRM status: ${statusId})`
    );
    await fulfillOrder(shopifyOrderId, shop, accessToken, trackingNumber);
  }

  if (KEYCRM_CONFIG.closeStatusIds.includes(statusId)) {
    console.log(
      `Closing Shopify order ${shopifyOrderId} (keyCRM status: ${statusId})`
    );
    await closeOrder(shopifyOrderId, shop, accessToken);
  }

  if (KEYCRM_CONFIG.cancelStatusIds.includes(statusId)) {
    console.log(
      `Cancelling Shopify order ${shopifyOrderId} (keyCRM status: ${statusId})`
    );

    // PostHog: fire order_cancelled for cancel statuses without esputnik mapping (e.g. 13, 14, 16, 17, 20)
    if (!esputnikStatus) {
      capturePostHog("order_cancelled");
    }

    // Release LiqPay hold if the order was not yet captured
    if (isLiqpayOrder) {
      const nnshopUrl = process.env.NEXT_APP_URL || "https://www.miomio.com.ua";
      const secret = process.env.INTERNAL_API_SECRET;
      const voidHeaders: Record<string, string> = { "Content-Type": "application/json" };
      if (secret) voidHeaders["Authorization"] = `Bearer ${secret}`;
      console.log(`[keyCRM webhook] triggering LiqPay void for ${shopifyOrderId}`);
      fetch(`${nnshopUrl}/api/liqpay/void`, {
        method: "POST",
        headers: voidHeaders,
        body: JSON.stringify({ shopifyOrderId }),
      })
        .then((r) => console.log(`[keyCRM webhook] void triggered for ${shopifyOrderId}: ${r.status}`))
        .catch((err) => console.error(`[keyCRM webhook] void failed:`, err));
    }

    try {
      await cancelOrder(shopifyOrderId, shop, accessToken);
    } catch (err: any) {
      // Shopify cannot cancel orders with outstanding fulfillments — log and skip
      if (err?.message?.includes("outstanding fulfillments")) {
        console.warn(
          `Shopify order ${shopifyOrderId} has outstanding fulfillments, cannot cancel — skipping`
        );
      } else if (err?.message?.includes("already been canceled")) {
        console.warn(
          `Shopify order ${shopifyOrderId} is already cancelled — skipping`
        );
      } else {
        throw err;
      }
    }
  }
}

export type { KeyCrmWebhookPayload };
