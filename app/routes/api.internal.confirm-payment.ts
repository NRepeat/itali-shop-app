import type { ActionFunctionArgs } from "react-router";
import {
  findKeyCrmOrderBySourceUuid,
  updateOrderInKeyCrm,
  fetchKeyCrmOrderPayments,
  markKeyCrmPaymentAsPaid,
} from "@/service/keycrm/keycrm-order.service";
import { esputnikOrderQueue } from "@shared/lib/queue/esputnik-order.queue";
import { KEYCRM_CONFIG } from "@shared/config/keycrm";
import { client as shopifyClient } from "@shared/lib/shopify/client/client";
import { prisma } from "@shared/lib/prisma/prisma.server";

const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET;

const GET_ORDER_QUERY = `
  query getOrder($id: ID!) {
    order(id: $id) {
      id
      name
      email
      note
      phone
      totalDiscountsSet { shopMoney { amount } }
      totalPriceSet { shopMoney { currencyCode } }
      shippingAddress {
        firstName
        lastName
        address1
        address2
        city
        country
        zip
        phone
      }
      lineItems(first: 50) {
        edges {
          node {
            title
            quantity
            originalUnitPriceSet { shopMoney { amount } }
            variant {
              id
              title
              product { id }
            }
          }
        }
      }
    }
  }
`;

// POST /api/internal/confirm-payment
// Called from nnshop payment callbacks after payment is confirmed.
// 1. Marks the keyCRM order as confirmed + paid
// 2. Builds eSputnik payload from Shopify order data
// 3. Queues eSputnik INITIALIZED event (deferred from process-order for pay-now)
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  if (INTERNAL_API_SECRET) {
    const authHeader = request.headers.get("Authorization");
    if (authHeader !== `Bearer ${INTERNAL_API_SECRET}`) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let body: {
    orderName: string;
    shopifyOrderId: string;
    amount: number;
    currency: string;
    paymentMethod?: string;
    shop: string;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { orderName, shopifyOrderId, amount, currency, paymentMethod = "liqpay", shop } = body;
  if (!orderName || typeof orderName !== "string") {
    return Response.json({ error: "Missing or invalid orderName" }, { status: 400 });
  }
  if (typeof amount !== "number" || isNaN(amount) || amount <= 0) {
    return Response.json({ error: "Missing or invalid amount" }, { status: 400 });
  }

  // Retry up to 5x with 1s delay — keyCRM order may not be created yet
  // if the BullMQ INITIALIZED job hasn't processed yet
  let keycrmOrder: { id: number } | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    keycrmOrder = await findKeyCrmOrderBySourceUuid(orderName);
    if (keycrmOrder) break;
    if (attempt < 4) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  if (!keycrmOrder) {
    console.warn(
      `[internal/confirm-payment] keyCRM order not found for ${orderName} after retries`
    );
    return Response.json(
      { error: "keyCRM order not found", orderName },
      { status: 404 }
    );
  }

  // Mark keyCRM order as confirmed + ensure payment record exists
  await updateOrderInKeyCrm(keycrmOrder.id, {
    status_id: KEYCRM_CONFIG.statuses.confirmed,
    payments: [
      {
        payment_method: paymentMethod,
        amount: Math.round(amount),
        currency,
        status: "paid",
      },
    ],
  });

  // Fetch payment ID and mark it as paid via dedicated endpoint
  try {
    const payments = await fetchKeyCrmOrderPayments(keycrmOrder.id);
    const payment = payments[0];
    if (payment?.id) {
      await markKeyCrmPaymentAsPaid(keycrmOrder.id, payment.id);
    } else {
      console.warn(`[internal/confirm-payment] no payment found on keyCRM order ${keycrmOrder.id}`);
    }
  } catch (err) {
    console.error(`[internal/confirm-payment] failed to mark payment as paid for keyCRM order ${keycrmOrder.id}:`, err);
  }

  console.log(
    `[internal/confirm-payment] keyCRM order ${keycrmOrder.id} confirmed + paid (${orderName})`
  );

  // Queue eSputnik INITIALIZED (deferred from process-order for pay-now orders)
  if (shopifyOrderId && shop) {
    try {
      const esputnikPayload = await buildEsputnikPayload(shopifyOrderId, paymentMethod, shop);
      if (esputnikPayload) {
        await esputnikOrderQueue.add("esputnik-order-sync", {
          payload: esputnikPayload,
          status: "INITIALIZED",
          shop,
        });
        console.log(`[internal/confirm-payment] eSputnik INITIALIZED queued for ${orderName}`);
      }
    } catch (err) {
      console.error(`[internal/confirm-payment] failed to build eSputnik payload:`, err);
    }
  }

  return Response.json({ ok: true, keycrmOrderId: keycrmOrder.id }, { status: 200 });
};

/**
 * Fetch Shopify order and build eSputnik-compatible payload.
 */
async function buildEsputnikPayload(
  shopifyOrderId: string,
  paymentMethod: string,
  shop: string,
): Promise<Record<string, any> | null> {
  // Get Shopify credentials from session store
  const session = await prisma.session.findFirst({
    where: { shop },
  });
  if (!session?.accessToken) {
    console.warn(`[confirm-payment] no Shopify session found for shop ${shop}`);
    return null;
  }

  const gid = shopifyOrderId.startsWith("gid://")
    ? shopifyOrderId
    : `gid://shopify/Order/${shopifyOrderId}`;

  const data = await shopifyClient.request<{ order: any }, { id: string }>({
    query: GET_ORDER_QUERY,
    variables: { id: gid },
    accessToken: session.accessToken,
    shopDomain: shop,
  });

  const order = data?.order;
  if (!order) return null;

  const numericId = gid.replace("gid://shopify/Order/", "");
  const totalDiscount = Number(order.totalDiscountsSet?.shopMoney?.amount ?? 0);
  const currency = order.totalPriceSet?.shopMoney?.currencyCode ?? "UAH";
  const sa = order.shippingAddress;

  return {
    id: Number(numericId),
    name: order.name,
    email: order.email || "",
    phone: order.phone || "",
    created_at: new Date().toISOString(),
    currency,
    financial_status: "paid",
    note: order.note || "",
    note_attributes: [],
    payment_gateway_names: [paymentMethod],
    customer: {
      first_name: sa?.firstName || "",
      last_name: sa?.lastName || "",
      email: order.email || "",
      phone: order.phone || sa?.phone || "",
    },
    shipping_address: sa
      ? {
          first_name: sa.firstName || "",
          last_name: sa.lastName || "",
          address1: sa.address1 || "",
          address2: sa.address2 || null,
          city: sa.city || "",
          country: sa.country || "",
          zip: sa.zip || "",
          phone: sa.phone || "",
        }
      : null,
    line_items: (order.lineItems?.edges ?? [])
      .filter((e: any) => e.node.quantity > 0)
      .map((e: any) => {
        const node = e.node;
        const variant = node.variant;
        return {
          title: node.title,
          variant_title:
            variant?.title && variant.title !== "Default Title"
              ? variant.title
              : "",
          quantity: node.quantity,
          price: node.originalUnitPriceSet?.shopMoney?.amount || "0",
          product_id: Number(
            variant?.product?.id?.replace("gid://shopify/Product/", "") || 0
          ),
          variant_id: Number(
            variant?.id?.replace("gid://shopify/ProductVariant/", "") || 0
          ),
          sku: "",
        };
      }),
    shipping_lines: [],
    applied_discount:
      totalDiscount > 0
        ? { type: "total", title: "Знижка", amount: totalDiscount.toFixed(2) }
        : null,
  };
}
