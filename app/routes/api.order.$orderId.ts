// GET /api/order/:orderId
// Returns full order data + customer contact info from Shopify
// orderId can be numeric (1001) or full GID (gid://shopify/Order/1001)

import { prisma } from "@shared/lib/prisma/prisma.server";
import { client } from "@shared/lib/shopify/client/client";
import type { LoaderFunctionArgs } from "react-router";

const ORDER_WITH_CUSTOMER_QUERY = `
  query getOrderByIdentifier($identifier: OrderIdentifierInput!) {
    orderByIdentifier(identifier: $identifier) {
      id
      name
      createdAt
      updatedAt
      cancelledAt
      displayFinancialStatus
      displayFulfillmentStatus
      tags
      note
      phone
      email
      totalPriceSet {
        shopMoney { amount currencyCode }
      }
      subtotalPriceSet {
        shopMoney { amount currencyCode }
      }
      totalTaxSet {
        shopMoney { amount currencyCode }
      }
      totalShippingPriceSet {
        shopMoney { amount currencyCode }
      }
      totalDiscountsSet {
        shopMoney { amount currencyCode }
      }
      totalReceivedSet {
        shopMoney { amount currencyCode }
      }
      totalRefundedSet {
        shopMoney { amount currencyCode }
      }
      paymentGatewayNames
      transactions(first: 10) {
        id
        gateway
        kind
        status
        amountSet {
          shopMoney { amount currencyCode }
        }
        processedAt
        errorCode
      }
      shippingAddress {
        firstName
        lastName
        company
        address1
        address2
        city
        zip
        country
        province
        phone
      }
      billingAddress {
        firstName
        lastName
        company
        address1
        address2
        city
        zip
        country
        province
        phone
      }
      lineItems(first: 100) {
        nodes {
          title
          quantity
          originalUnitPriceSet {
            shopMoney { amount currencyCode }
          }
          discountedUnitPriceSet {
            shopMoney { amount currencyCode }
          }
          variant {
            id
            title
            sku
          }
          product {
            id
            handle
            title
          }
        }
      }
      customer {
        id
        firstName
        lastName
        email
        phone
        createdAt
        note
        tags
        defaultAddress {
          address1
          address2
          city
          zip
          country
          province
          phone
        }
        addressesV2(first: 10) {
          nodes {
            firstName
            lastName
            company
            address1
            address2
            city
            zip
            country
            province
            phone
          }
        }
        numberOfOrders
        amountSpent {
          amount
          currencyCode
        }
      }
    }
  }
`;

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const { orderId } = params;

  if (!orderId) {
    return Response.json({ error: "orderId is required" }, { status: 400 });
  }

  const shopifyOrderId = orderId.startsWith("gid://")
    ? orderId
    : `gid://shopify/Order/${orderId}`;

  const session = await prisma.session.findFirst({
    select: { shop: true, accessToken: true },
  });

  if (!session?.accessToken || !session.shop) {
    return Response.json({ error: "No Shopify session found" }, { status: 503 });
  }

  try {
    const data = await client.request<{ orderByIdentifier: any }>({
      query: ORDER_WITH_CUSTOMER_QUERY,
      variables: { identifier: { id: shopifyOrderId } },
      accessToken: session.accessToken,
      shopDomain: session.shop,
    });

    const order = data.orderByIdentifier;

    if (!order) {
      return Response.json({ error: "Order not found" }, { status: 404 });
    }

    return Response.json({
      order: {
        id: order.id,
        name: order.name,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        cancelledAt: order.cancelledAt,
        financialStatus: order.displayFinancialStatus,
        fulfillmentStatus: order.displayFulfillmentStatus,
        tags: order.tags,
        note: order.note,
        email: order.email,
        phone: order.phone,
        total: order.totalPriceSet?.shopMoney,
        subtotal: order.subtotalPriceSet?.shopMoney,
        totalTax: order.totalTaxSet?.shopMoney,
        totalShipping: order.totalShippingPriceSet?.shopMoney,
        totalDiscounts: order.totalDiscountsSet?.shopMoney,
        totalReceived: order.totalReceivedSet?.shopMoney,
        totalRefunded: order.totalRefundedSet?.shopMoney,
        paymentGateways: order.paymentGatewayNames ?? [],
        transactions: (order.transactions ?? []).map((tx: any) => ({
          id: tx.id,
          gateway: tx.gateway,
          kind: tx.kind,
          status: tx.status,
          amount: tx.amountSet?.shopMoney,
          processedAt: tx.processedAt,
          errorCode: tx.errorCode ?? null,
        })),
        shippingAddress: order.shippingAddress,
        billingAddress: order.billingAddress,
        lineItems: (order.lineItems?.nodes ?? []).map((item: any) => ({
          title: item.title,
          quantity: item.quantity,
          price: item.originalUnitPriceSet?.shopMoney,
          discountedPrice: item.discountedUnitPriceSet?.shopMoney,
          sku: item.variant?.sku,
          variantTitle: item.variant?.title,
          productTitle: item.product?.title,
          productHandle: item.product?.handle,
        })),
        customer: order.customer
          ? {
              id: order.customer.id,
              firstName: order.customer.firstName,
              lastName: order.customer.lastName,
              email: order.customer.email,
              phone: order.customer.phone,
              createdAt: order.customer.createdAt,
              note: order.customer.note,
              tags: order.customer.tags,
              defaultAddress: order.customer.defaultAddress,
              addresses: order.customer.addressesV2?.nodes ?? [],
              numberOfOrders: order.customer.numberOfOrders,
              totalSpent: order.customer.amountSpent,
            }
          : null,
      },
    });
  } catch (err: any) {
    console.error("[api.order] Error:", err.message);
    return Response.json({ error: "Failed to fetch order data" }, { status: 500 });
  }
};
