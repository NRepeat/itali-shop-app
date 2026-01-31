import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

const CUSTOMERS_QUERY = `
  query customers($first: Int!, $query: String) {
    customers(first: $first, query: $query) {
      nodes {
        id
        displayName
        email
        numberOfOrders
      }
    }
  }
`;

const CUSTOMER_ORDERS_QUERY = `
  query customerOrders($id: ID!) {
    customer(id: $id) {
      displayName
      email
      orders(first: 50, sortKey: CREATED_AT, reverse: true) {
        nodes {
          id
          name
          createdAt
          totalPriceSet { shopMoney { amount currencyCode } }
          displayFinancialStatus
          displayFulfillmentStatus
          lineItems(first: 50) {
            nodes {
              title
              quantity
              originalUnitPriceSet { shopMoney { amount currencyCode } }
              variant {
                id
                title
                sku
              }
            }
          }
        }
      }
    }
  }
`;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(CUSTOMERS_QUERY, {
    variables: { first: 20 },
  });
  const { data } = await response.json();

  return { customers: data.customers.nodes };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const body = await request.json();

  if (body.action === "search-customers") {
    const response = await admin.graphql(CUSTOMERS_QUERY, {
      variables: { first: 20, query: body.query || undefined },
    });
    const { data } = await response.json();
    return { type: "customers", customers: data.customers.nodes };
  }

  if (body.action === "get-orders") {
    const response = await admin.graphql(CUSTOMER_ORDERS_QUERY, {
      variables: { id: body.customerId },
    });
    const { data } = await response.json();
    return { type: "orders", customer: data.customer };
  }

  return { type: "error", message: "Unknown action" };
};

interface Customer {
  id: string;
  displayName: string;
  email: string;
  numberOfOrders: string;
}

interface LineItem {
  title: string;
  quantity: number;
  originalUnitPriceSet: { shopMoney: { amount: string; currencyCode: string } };
  variant: { id: string; title: string; sku: string } | null;
}

interface Order {
  id: string;
  name: string;
  createdAt: string;
  totalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
  displayFinancialStatus: string;
  displayFulfillmentStatus: string;
  lineItems: { nodes: LineItem[] };
}

interface CustomerWithOrders {
  displayName: string;
  email: string;
  orders: { nodes: Order[] };
}

export default function CustomersPage() {
  const { customers: initialCustomers } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerWithOrders | null>(null);
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());

  const isLoading = fetcher.state !== "idle";

  const customers: Customer[] =
    fetcher.data?.type === "customers"
      ? (fetcher.data as any).customers
      : initialCustomers;

  if (fetcher.data?.type === "orders" && fetcher.state === "idle") {
    const incoming = (fetcher.data as any).customer as CustomerWithOrders;
    if (incoming && incoming.displayName !== selectedCustomer?.displayName) {
      setSelectedCustomer(incoming);
      setExpandedOrders(new Set());
    }
  }

  const handleSearch = () => {
    fetcher.submit(
      { action: "search-customers", query: searchQuery },
      { method: "post", encType: "application/json" },
    );
  };

  const handleSelectCustomer = (customerId: string) => {
    setSelectedCustomer(null);
    setExpandedOrders(new Set());
    fetcher.submit(
      { action: "get-orders", customerId },
      { method: "post", encType: "application/json" },
    );
  };

  const toggleOrder = (orderId: string) => {
    setExpandedOrders((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  };

  const rowStyle = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 100px",
    padding: "10px 12px",
    borderBottom: "1px solid #e5e5e5",
    cursor: "pointer",
    fontSize: "14px",
  } as const;

  const headerRowStyle = {
    ...rowStyle,
    fontWeight: "bold" as const,
    background: "#f4f4f5",
    cursor: "default" as const,
  };

  return (
    <s-page heading="Customers">
      <s-section heading="Search Customers">
        <div style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
          <s-text-field
            label="Search"
            value={searchQuery}
            onInput={(e: any) => setSearchQuery(e.target.value)}
            help-text="Search by name, email, etc."
          />
          <s-button variant="primary" onClick={handleSearch} disabled={isLoading || undefined}>
            {isLoading && fetcher.json?.action === "search-customers" ? "Searching..." : "Search"}
          </s-button>
        </div>
      </s-section>

      <s-section heading={`Customers (${customers.length})`}>
        <div style={{ border: "1px solid #e5e5e5", borderRadius: "8px", overflow: "hidden" }}>
          <div style={headerRowStyle}>
            <span>Name</span>
            <span>Email</span>
            <span>Orders</span>
          </div>
          {customers.map((c: Customer) => (
            <div
              key={c.id}
              style={{ ...rowStyle, ":hover": undefined }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.background = "#f0f0ff")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.background = "")}
              onClick={() => handleSelectCustomer(c.id)}
            >
              <span>{c.displayName}</span>
              <span style={{ color: "#666" }}>{c.email}</span>
              <span>{c.numberOfOrders}</span>
            </div>
          ))}
          {customers.length === 0 && (
            <div style={{ padding: "16px", textAlign: "center" as const, color: "#888" }}>
              No customers found
            </div>
          )}
        </div>
      </s-section>

      {isLoading && fetcher.json?.action === "get-orders" && (
        <s-section heading="Loading orders...">
          <div style={{ padding: "12px", color: "#666" }}>Fetching customer orders...</div>
        </s-section>
      )}

      {selectedCustomer && (
        <s-section heading={`Orders — ${selectedCustomer.displayName} (${selectedCustomer.email})`}>
          {selectedCustomer.orders.nodes.length === 0 ? (
            <div style={{ padding: "16px", color: "#888" }}>No orders found</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" as const, gap: "8px" }}>
              {selectedCustomer.orders.nodes.map((order: Order) => {
                const isExpanded = expandedOrders.has(order.id);
                const money = order.totalPriceSet.shopMoney;
                return (
                  <div
                    key={order.id}
                    style={{
                      border: "1px solid #e5e5e5",
                      borderRadius: "8px",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      onClick={() => toggleOrder(order.id)}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "10px 12px",
                        cursor: "pointer",
                        background: isExpanded ? "#f0f0ff" : "#fafafa",
                        fontFamily: "monospace",
                        fontSize: "13px",
                      }}
                    >
                      <span>
                        <strong>{order.name}</strong>
                        {" — "}
                        {new Date(order.createdAt).toLocaleDateString()}
                        {" — "}
                        {money.amount} {money.currencyCode}
                        {" — "}
                        {order.displayFinancialStatus}
                        {" — "}
                        {order.displayFulfillmentStatus}
                      </span>
                      <span style={{ fontSize: "16px" }}>{isExpanded ? "▼" : "▶"}</span>
                    </div>

                    {isExpanded && (
                      <div style={{ padding: "8px 12px 12px 24px", background: "#fff" }}>
                        {order.lineItems.nodes.map((item: LineItem, idx: number) => {
                          const price = item.originalUnitPriceSet.shopMoney;
                          const variantLabel =
                            item.variant?.title && item.variant.title !== "Default Title"
                              ? ` (${item.variant.title})`
                              : "";
                          return (
                            <div
                              key={idx}
                              style={{
                                padding: "4px 0",
                                fontFamily: "monospace",
                                fontSize: "13px",
                                color: "#333",
                              }}
                            >
                              └─ {item.title}
                              {variantLabel} × {item.quantity} — {price.amount}{" "}
                              {price.currencyCode}
                              {item.variant?.sku && (
                                <span style={{ color: "#888" }}> — SKU: {item.variant.sku}</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </s-section>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
