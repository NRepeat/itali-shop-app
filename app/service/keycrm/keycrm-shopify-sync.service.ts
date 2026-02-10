import { KEYCRM_CONFIG } from "@shared/config/keycrm";
import { prisma } from "@shared/lib/prisma/prisma.server";
import { client } from "../sync/client/shopify";
import { esputnikOrderQueue } from "@shared/lib/queue/esputnik-order.queue";
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
      customer { firstName lastName email phone }
      shippingAddress {
        address1 address2 city province zip country
      }
      lineItems(first: 50) {
        nodes {
          title variantTitle quantity sku
          originalUnitPriceSet { shopMoney { amount } }
          product { id }
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
    throw new Error(`orderMarkAsPaid failed: ${errors.map((e) => e.message).join(", ")}`);
  }

  console.log(`Shopify order ${shopifyOrderId} marked as paid`);
}

async function fulfillOrder(
  shopifyOrderId: string,
  shop: string,
  accessToken: string
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

    if (lineItems.length === 0) continue;

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
          notifyCustomer:false,
          lineItemsByFulfillmentOrder: [
            {
              fulfillmentOrderId: fo.id,
              fulfillmentOrderLineItems: lineItems,
            },
          ],
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
    `keyCRM webhook: order ${keycrmOrderId} status changed to ${statusId}`
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

  const { shop, accessToken } = await getShopAndToken();
  const shopifyOrderId = mapping.shopifyOrderId;

  // 1. eSputnik event (Підтверджено, Відправлено, Виконано, Скасовано, Немає в наявності)
  const esputnikStatus = KEYCRM_CONFIG.esputnikStatusMap[statusId];
  if (esputnikStatus) {
    console.log(
      `keyCRM status ${statusId} → sending ${esputnikStatus} to eSputnik for order ${shopifyOrderId}`
    );

    const orderData = await client.request<
      { order: any },
      { orderId: string }
    >({
      query: GET_ORDER_QUERY,
      variables: { orderId: gqlOrderId(shopifyOrderId) },
      accessToken,
      shopDomain: shop,
    });

    const webhookPayload = graphqlOrderToWebhookPayload(orderData.order);

    await esputnikOrderQueue.add("esputnik-order-sync", {
      payload: webhookPayload,
      status: esputnikStatus,
      shop,
    });

    console.log(
      `eSputnik ${esputnikStatus} event queued for order ${shopifyOrderId}`
    );
  }

  // 2. Shopify actions
  if (KEYCRM_CONFIG.paidStatusIds.includes(statusId)) {
    console.log(
      `Marking Shopify order ${shopifyOrderId} as paid (keyCRM status: ${statusId})`
    );
    await markOrderAsPaid(shopifyOrderId, shop, accessToken);
  }

  if (KEYCRM_CONFIG.fulfillStatusIds.includes(statusId)) {
    console.log(
      `Fulfilling Shopify order ${shopifyOrderId} (keyCRM status: ${statusId})`
    );
    await fulfillOrder(shopifyOrderId, shop, accessToken);
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
    await cancelOrder(shopifyOrderId, shop, accessToken);
  }
}

export type { KeyCrmWebhookPayload };
