// GET /api/customer?email=user@example.com
// Returns customer contact info + all orders from Shopify

import { prisma } from "@shared/lib/prisma/prisma.server";
import { client } from "@shared/lib/shopify/client/client";
import type { LoaderFunctionArgs } from "react-router";

const CUSTOMER_WITH_ORDERS_QUERY = `
  query getCustomerByEmail($query: String!) {
    customers(first: 1, query: $query) {
      nodes {
        id
        firstName
        lastName
        email
        phone
        createdAt
        updatedAt
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
        addresses(first: 20) {
          nodes {
            address1
            address2
            city
            zip
            country
            province
            phone
            firstName
            lastName
            company
          }
        }
        orders(first: 250, sortKey: CREATED_AT, reverse: true) {
          nodes {
            id
            name
            createdAt
            updatedAt
            cancelledAt
            financialStatus
            fulfillmentStatus
            tags
            note
            totalPriceSet {
              shopMoney { amount currencyCode }
            }
            subtotalPriceSet {
              shopMoney { amount currencyCode }
            }
            shippingAddress {
              firstName
              lastName
              address1
              address2
              city
              zip
              country
              phone
            }
            lineItems(first: 50) {
              nodes {
                title
                quantity
                originalUnitPriceSet {
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
                }
              }
            }
          }
        }
      }
    }
  }
`;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const email = url.searchParams.get("email")?.trim();

  if (!email) {
    return Response.json({ error: "email query parameter is required" }, { status: 400 });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: "Invalid email format" }, { status: 400 });
  }

  const session = await prisma.session.findFirst({
    select: { shop: true, accessToken: true },
  });

  if (!session?.accessToken || !session.shop) {
    return Response.json({ error: "No Shopify session found" }, { status: 503 });
  }

  try {
    const data = await client.request<{
      customers: {
        nodes: any[];
      };
    }>({
      query: CUSTOMER_WITH_ORDERS_QUERY,
      variables: { query: `email:${email}` },
      accessToken: session.accessToken,
      shopDomain: session.shop,
    });

    const customer = data.customers?.nodes?.[0];

    if (!customer) {
      return Response.json({ error: "Customer not found" }, { status: 404 });
    }

    return Response.json({
      customer: {
        id: customer.id,
        firstName: customer.firstName,
        lastName: customer.lastName,
        email: customer.email,
        phone: customer.phone,
        createdAt: customer.createdAt,
        note: customer.note,
        tags: customer.tags,
        defaultAddress: customer.defaultAddress,
        addresses: customer.addresses?.nodes ?? [],
        ordersCount: customer.orders?.nodes?.length ?? 0,
        orders: (customer.orders?.nodes ?? []).map((order: any) => ({
          id: order.id,
          name: order.name,
          createdAt: order.createdAt,
          cancelledAt: order.cancelledAt,
          financialStatus: order.financialStatus,
          fulfillmentStatus: order.fulfillmentStatus,
          tags: order.tags,
          note: order.note,
          total: order.totalPriceSet?.shopMoney,
          subtotal: order.subtotalPriceSet?.shopMoney,
          shippingAddress: order.shippingAddress,
          lineItems: (order.lineItems?.nodes ?? []).map((item: any) => ({
            title: item.title,
            quantity: item.quantity,
            price: item.originalUnitPriceSet?.shopMoney,
            sku: item.variant?.sku,
            variantTitle: item.variant?.title,
            productHandle: item.product?.handle,
          })),
        })),
      },
    });
  } catch (err: any) {
    console.error("[api.customer] Error:", err.message);
    return Response.json({ error: "Failed to fetch customer data" }, { status: 500 });
  }
};
