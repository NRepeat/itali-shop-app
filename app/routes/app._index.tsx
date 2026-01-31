import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  syncCollections,
  syncBrandCollections,
} from "@/service/sync/collection/syncCollections";
import { syncProducts } from "@/service/sync/products/syncProducts";
import { syncCustomers } from "@/service/sync/customers/syncCustomers";
import { syncOrders } from "@/service/sync/orders/syncOrders";
import { externalDB, prisma } from "@shared/lib/prisma/prisma.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  const [
    totalExternal,
    syncedCount,
    totalCategories,
    totalBrands,
    lastSynced,
    totalCustomers,
    syncedCustomers,
    totalOrders,
    syncedOrders,
  ] = await Promise.all([
    externalDB.bc_product.count({
      where: { status: true, quantity: { gt: 0 } },
    }),
    prisma.productMap.count(),
    externalDB.bc_category.count(),
    externalDB.bc_manufacturer.count(),
    prisma.productMap.findFirst({ orderBy: { updatedAt: "desc" } }),
    externalDB.bc_customer.count({ where: { status: true } }),
    prisma.customerMap.count(),
    externalDB.bc_order.count(),
    prisma.orderMap.count(),
  ]);

  return {
    totalExternal,
    syncedCount,
    remaining: totalExternal - syncedCount,
    totalCategories,
    totalBrands,
    lastSyncedAt: lastSynced?.updatedAt?.toISOString() || null,
    totalCustomers,
    syncedCustomers,
    remainingCustomers: totalCustomers - syncedCustomers,
    totalOrders,
    syncedOrders,
    remainingOrders: totalOrders - syncedOrders,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const body = await request.json();
  let logs: string[] = [];
  const startTime = Date.now();
  try {
    if (body.action === "sync-categories") {
      logs = (await syncCollections(admin)) || [];
    } else if (body.action === "sync-brands") {
      logs = (await syncBrandCollections(admin)) || [];
    } else if (body.action === "sync-products") {
      const limit = body.limit ? Number(body.limit) : undefined;
      logs =
        (await syncProducts(session.shop, session.accessToken!, limit)) || [];
    } else if (body.action === "sync-customers") {
      const limit = body.limit ? Number(body.limit) : undefined;
      logs =
        (await syncCustomers(session.shop, session.accessToken!, limit)) || [];
    } else if (body.action === "sync-orders") {
      const limit = body.limit ? Number(body.limit) : undefined;
      logs =
        (await syncOrders(session.shop, session.accessToken!, limit)) || [];
    } else if (body.action === "delete-cart-transform") {
      logs.push("Looking for active cart transforms...");

      const listResponse = await admin.graphql(`
        {
          cartTransforms(first: 25) {
            nodes {
              id
              functionId
            }
          }
        }
      `);
      const { data: listData } = await listResponse.json();
      const transforms = listData.cartTransforms.nodes;
      logs.push(`Found ${transforms.length} cart transform(s)`);

      if (transforms.length === 0) {
        logs.push("No cart transforms to delete");
        return { success: true, logs, action: body.action };
      }

      for (const ct of transforms) {
        logs.push(`Deleting cart transform: ${ct.id}`);
        const deleteResponse = await admin.graphql(
          `
          mutation cartTransformDelete($id: ID!) {
            cartTransformDelete(id: $id) {
              deletedId
              userErrors {
                field
                message
              }
            }
          }
        `,
          { variables: { id: ct.id } },
        );
        const { data: deleteData } = await deleteResponse.json();

        if (deleteData.cartTransformDelete.userErrors?.length > 0) {
          deleteData.cartTransformDelete.userErrors.forEach((e: any) => {
            logs.push(`ERROR: ${e.field} — ${e.message}`);
          });
        } else {
          logs.push(`Deleted: ${deleteData.cartTransformDelete.deletedId}`);
        }
      }
    } else if (body.action === "activate-cart-transform") {
      const handle = "discount-by-line";
      logs.push(`Activating cart transform with handle: ${handle}`);

      const createResponse = await admin.graphql(
        `
        mutation cartTransformCreate($functionHandle: String!) {
          cartTransformCreate(functionHandle: $functionHandle) {
            cartTransform {
              id
              functionId
            }
            userErrors {
              field
              message
            }
          }
        }
      `,
        { variables: { functionHandle: handle } },
      );
      const { data: createData } = await createResponse.json();
      console.log("cartTransformCreate result:", JSON.stringify(createData));
      logs.push(`Raw response: ${JSON.stringify(createData)}`);

      if (createData.cartTransformCreate.userErrors?.length > 0) {
        createData.cartTransformCreate.userErrors.forEach((e: any) => {
          logs.push(`ERROR: ${e.field} — ${e.message}`);
        });
        return { success: false, logs, action: body.action };
      }

      const ct = createData.cartTransformCreate.cartTransform;
      logs.push(
        `Cart Transform activated! ID: ${ct.id}, functionId: ${ct.functionId}`,
      );
    } else if (body.action === "activate-discount-function") {
      const handle = "discount-function";
      logs.push(`Creating automatic discount with function handle: ${handle}`);

      const createResponse = await admin.graphql(
        `
        mutation discountAutomaticAppCreate($automaticAppDiscount: DiscountAutomaticAppInput!) {
          discountAutomaticAppCreate(automaticAppDiscount: $automaticAppDiscount) {
            automaticAppDiscount {
              discountId
              title
              status
            }
            userErrors {
              field
              message
            }
          }
        }
      `,
        {
          variables: {
            automaticAppDiscount: {
              title: "Metafield Znizka Discount",
              functionHandle: handle,
              startsAt: new Date().toISOString(),
              combinesWith: {
                orderDiscounts: true,
                productDiscounts: false,
                shippingDiscounts: true,
              },
            },
          },
        },
      );
      const { data: createData } = await createResponse.json();
      console.log("discountAutomaticAppCreate result:", JSON.stringify(createData));
      logs.push(`Raw response: ${JSON.stringify(createData)}`);

      if (createData.discountAutomaticAppCreate.userErrors?.length > 0) {
        createData.discountAutomaticAppCreate.userErrors.forEach((e: any) => {
          logs.push(`ERROR: ${e.field} — ${e.message}`);
        });
        return { success: false, logs, action: body.action };
      }

      const disc = createData.discountAutomaticAppCreate.automaticAppDiscount;
      logs.push(
        `Discount activated! ID: ${disc.discountId}, Title: ${disc.title}, Status: ${disc.status}`,
      );
    } else if (body.action === "delete-discount-function") {
      logs.push("Looking for active app discounts...");

      const listResponse = await admin.graphql(`
        {
          discountNodes(first: 50, query: "type:automatic") {
            nodes {
              id
              discount {
                ... on DiscountAutomaticApp {
                  title
                  status
                }
              }
            }
          }
        }
      `);
      const { data: listData } = await listResponse.json();
      const discounts = listData.discountNodes.nodes.filter(
        (n: any) => n.discount?.title === "Metafield Znizka Discount",
      );
      logs.push(`Found ${discounts.length} matching discount(s)`);

      for (const disc of discounts) {
        logs.push(`Deleting discount: ${disc.id}`);
        const deleteResponse = await admin.graphql(
          `
          mutation discountAutomaticDelete($id: ID!) {
            discountAutomaticDelete(id: $id) {
              deletedAutomaticDiscountId
              userErrors {
                field
                message
              }
            }
          }
        `,
          { variables: { id: disc.id } },
        );
        const { data: deleteData } = await deleteResponse.json();

        if (deleteData.discountAutomaticDelete.userErrors?.length > 0) {
          deleteData.discountAutomaticDelete.userErrors.forEach((e: any) => {
            logs.push(`ERROR: ${e.field} — ${e.message}`);
          });
        } else {
          logs.push(`Deleted: ${deleteData.discountAutomaticDelete.deletedAutomaticDiscountId}`);
        }
      }
    }
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    logs.push(`--- Done in ${elapsed}s ---`);
    return { success: true, logs, action: body.action };
  } catch (e: any) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    logs = e.logs || [e.message];
    logs.push(`--- Failed after ${elapsed}s ---`);
    return { success: false, logs, action: body.action };
  }
};

export default function Index() {
  const stats = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const [productLimit, setProductLimit] = useState("5");
  const [customerLimit, setCustomerLimit] = useState("5");
  const [orderLimit, setOrderLimit] = useState("5");
  const isLoading = fetcher.state !== "idle";

  const handleAction = (action: string, limit?: string) => {
    const payload: Record<string, string> = { action };
    if (limit) {
      payload.limit = limit;
    }
    fetcher.submit(payload, { method: "post", encType: "application/json" });
  };

  const logs = fetcher.data?.logs || [];

  const statStyle = {
    display: "inline-block",
    padding: "8px 16px",
    margin: "4px",
    borderRadius: "8px",
    background: "#f4f4f5",
    fontFamily: "monospace",
  } as const;

  const statValueStyle = {
    fontSize: "20px",
    fontWeight: "bold",
    display: "block",
  } as const;

  const statLabelStyle = {
    fontSize: "12px",
    color: "#666",
  } as const;

  return (
    <s-page heading="Itali Shop App">
      <s-section heading="Statistics">
        <div style={{ display: "flex", flexWrap: "wrap" as const, gap: "8px" }}>
          <div style={statStyle}>
            <span style={statValueStyle}>{stats.totalExternal}</span>
            <span style={statLabelStyle}>Products in DB</span>
          </div>
          <div style={statStyle}>
            <span style={statValueStyle}>{stats.syncedCount}</span>
            <span style={statLabelStyle}>Synced to Shopify</span>
          </div>
          <div
            style={{
              ...statStyle,
              background: stats.remaining > 0 ? "#fef3c7" : "#d1fae5",
            }}
          >
            <span style={statValueStyle}>{stats.remaining}</span>
            <span style={statLabelStyle}>Remaining</span>
          </div>
          <div style={statStyle}>
            <span style={statValueStyle}>{stats.totalCategories}</span>
            <span style={statLabelStyle}>Categories</span>
          </div>
          <div style={statStyle}>
            <span style={statValueStyle}>{stats.totalBrands}</span>
            <span style={statLabelStyle}>Brands</span>
          </div>
          <div style={statStyle}>
            <span style={statValueStyle}>
              {stats.syncedCustomers}/{stats.totalCustomers}
            </span>
            <span style={statLabelStyle}>Customers synced</span>
          </div>
          <div style={statStyle}>
            <span style={statValueStyle}>
              {stats.syncedOrders}/{stats.totalOrders}
            </span>
            <span style={statLabelStyle}>Orders synced</span>
          </div>
          {stats.lastSyncedAt && (
            <div style={statStyle}>
              <span style={{ ...statValueStyle, fontSize: "14px" }}>
                {new Date(stats.lastSyncedAt).toLocaleString()}
              </span>
              <span style={statLabelStyle}>Last synced</span>
            </div>
          )}
        </div>
      </s-section>

      <s-section heading="Sync Products">
        <div
          style={{
            display: "flex",
            gap: "8px",
            alignItems: "flex-end",
            flexWrap: "wrap" as const,
          }}
        >
          <s-text-field
            label="Product limit"
            type="number"
            value={productLimit}
            min="1"
            onInput={(e: any) => setProductLimit(e.target.value)}
            help-text="Number of products to create"
          ></s-text-field>
          <s-button
            variant="primary"
            onClick={() => handleAction("sync-products", productLimit)}
            disabled={isLoading || undefined}
          >
            {isLoading &&
            fetcher.json?.action === "sync-products" &&
            fetcher.json?.limit
              ? "Creating products..."
              : `Sync ${productLimit || "N"} Products`}
          </s-button>
          <s-button
            variant="primary"
            tone="critical"
            onClick={() => handleAction("sync-products")}
            disabled={isLoading || undefined}
          >
            {isLoading &&
            fetcher.json?.action === "sync-products" &&
            !fetcher.json?.limit
              ? "Creating all..."
              : `Sync ALL (${stats.remaining})`}
          </s-button>
        </div>
      </s-section>

      <s-section heading="Sync Customers">
        <div
          style={{
            display: "flex",
            gap: "8px",
            alignItems: "flex-end",
            flexWrap: "wrap" as const,
          }}
        >
          <s-text-field
            label="Customer limit"
            type="number"
            value={customerLimit}
            min="1"
            onInput={(e: any) => setCustomerLimit(e.target.value)}
            help-text="Number of customers to sync"
          ></s-text-field>
          <s-button
            variant="primary"
            onClick={() => handleAction("sync-customers", customerLimit)}
            disabled={isLoading || undefined}
          >
            {isLoading &&
            fetcher.json?.action === "sync-customers" &&
            fetcher.json?.limit
              ? "Syncing customers..."
              : `Sync ${customerLimit || "N"} Customers`}
          </s-button>
          <s-button
            variant="primary"
            tone="critical"
            onClick={() => handleAction("sync-customers")}
            disabled={isLoading || undefined}
          >
            {isLoading &&
            fetcher.json?.action === "sync-customers" &&
            !fetcher.json?.limit
              ? "Syncing all..."
              : `Sync ALL (${stats.remainingCustomers})`}
          </s-button>
        </div>
      </s-section>

      <s-section heading="Sync Orders">
        <div
          style={{
            display: "flex",
            gap: "8px",
            alignItems: "flex-end",
            flexWrap: "wrap" as const,
          }}
        >
          <s-text-field
            label="Order limit"
            type="number"
            value={orderLimit}
            min="1"
            onInput={(e: any) => setOrderLimit(e.target.value)}
            help-text="Number of orders to sync"
          ></s-text-field>
          <s-button
            variant="primary"
            onClick={() => handleAction("sync-orders", orderLimit)}
            disabled={isLoading || undefined}
          >
            {isLoading &&
            fetcher.json?.action === "sync-orders" &&
            fetcher.json?.limit
              ? "Syncing orders..."
              : `Sync ${orderLimit || "N"} Orders`}
          </s-button>
          <s-button
            variant="primary"
            tone="critical"
            onClick={() => handleAction("sync-orders")}
            disabled={isLoading || undefined}
          >
            {isLoading &&
            fetcher.json?.action === "sync-orders" &&
            !fetcher.json?.limit
              ? "Syncing all..."
              : `Sync ALL (${stats.remainingOrders})`}
          </s-button>
        </div>
      </s-section>

      <s-section heading="Cart Transform">
        <div style={{ display: "flex", gap: "8px" }}>
          <s-button
            variant="primary"
            onClick={() => handleAction("activate-cart-transform")}
            disabled={isLoading || undefined}
          >
            {isLoading && fetcher.json?.action === "activate-cart-transform"
              ? "Activating..."
              : "Activate Cart Transform (Discount)"}
          </s-button>
          <s-button
            variant="primary"
            tone="critical"
            onClick={() => handleAction("delete-cart-transform")}
            disabled={isLoading || undefined}
          >
            {isLoading && fetcher.json?.action === "delete-cart-transform"
              ? "Deleting..."
              : "Delete Cart Transform"}
          </s-button>
        </div>
      </s-section>

      <s-section heading="Discount Function">
        <div style={{ display: "flex", gap: "8px" }}>
          <s-button
            variant="primary"
            onClick={() => handleAction("activate-discount-function")}
            disabled={isLoading || undefined}
          >
            {isLoading && fetcher.json?.action === "activate-discount-function"
              ? "Activating..."
              : "Activate Discount Function"}
          </s-button>
          <s-button
            variant="primary"
            tone="critical"
            onClick={() => handleAction("delete-discount-function")}
            disabled={isLoading || undefined}
          >
            {isLoading && fetcher.json?.action === "delete-discount-function"
              ? "Deleting..."
              : "Delete Discount Function"}
          </s-button>
        </div>
      </s-section>

      <s-section heading="Sync Collections">
        <div style={{ display: "flex", gap: "8px" }}>
          <s-button
            onClick={() => handleAction("sync-categories")}
            disabled={isLoading || undefined}
          >
            {isLoading && fetcher.json?.action === "sync-categories"
              ? "Syncing..."
              : `Sync Categories (${stats.totalCategories})`}
          </s-button>
          <s-button
            onClick={() => handleAction("sync-brands")}
            disabled={isLoading || undefined}
          >
            {isLoading && fetcher.json?.action === "sync-brands"
              ? "Syncing..."
              : `Sync Brands (${stats.totalBrands})`}
          </s-button>
        </div>
      </s-section>

      {(isLoading || logs.length > 0) && (
        <s-section
          heading={
            isLoading
              ? "Running..."
              : `Logs — ${fetcher.data?.action} (${logs.length} entries)`
          }
        >
          {isLoading && (
            <div style={{ padding: "12px", color: "#666" }}>
              Sync in progress, please wait...
            </div>
          )}
          {logs.length > 0 && (
            <>
              <div
                style={{
                  background: "#1a1a2e",
                  color: "#0f0",
                  padding: "12px",
                  borderRadius: "8px",
                  fontFamily: "monospace",
                  fontSize: "12px",
                  maxHeight: "400px",
                  overflowY: "auto" as const,
                  whiteSpace: "pre-wrap" as const,
                }}
              >
                {logs.map((line, i) => (
                  <div
                    key={i}
                    style={{
                      color: line.includes("Error")
                        ? "#f44"
                        : line.startsWith("---")
                          ? "#888"
                          : "#0f0",
                      padding: "2px 0",
                    }}
                  >
                    {line}
                  </div>
                ))}
              </div>
              {fetcher.data && !isLoading && (
                <div style={{ marginTop: "8px", fontWeight: "bold" }}>
                  {fetcher.data.success ? (
                    <span style={{ color: "green" }}>
                      Completed successfully
                    </span>
                  ) : (
                    <span style={{ color: "red" }}>Completed with errors</span>
                  )}
                </div>
              )}
            </>
          )}
        </s-section>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
