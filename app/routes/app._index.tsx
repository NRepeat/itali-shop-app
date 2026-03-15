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
  translateExistingCollections,
  stripGenderFromHandle,
} from "@/service/sync/collection/syncCollections";
import { syncProducts } from "@/service/sync/products/syncProducts";
import { updateExistingProductLinks } from "@/service/sync/products/update-existing-product-links";
import {
  updateProductHandles,
  updateProductHandlesParallel,
} from "@/service/sync/products/update-product-handles";
import {
  updateProductTitles,
  updateProductTitlesParallel,
} from "@/service/sync/products/update-product-titles";
import { syncCustomers } from "@/service/sync/customers/syncCustomers";
import { syncOrders } from "@/service/sync/orders/syncOrders";
import { externalDB, prisma } from "@shared/lib/prisma/prisma.server";
import { findShopifyProductBySku } from "@/service/shopify/products/api/find-shopify-product";
import { revalidateNextJs } from "@/service/revalidate/revalidate-nextjs";
import { compareProducts, fixOrphanedMaps } from "@/service/sync/products/compare-products.service";
import { syncMissingProducts } from "@/service/sync/products/sync-missing-products.service";

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
      const response = await admin.graphql(`
  {
    collections(first: 250) {
      nodes {
        id
        handle
      }
    }
  }
`);
      const { data } = await response.json();
      console.log("allCollection:", JSON.stringify(data.collections));
      const collections = data.collections.nodes;
      // for (const c of collections) {
      //   const res = await admin.graphql(
      //     `mutation collectionUpdate($input: CollectionInput!) {
      //       collectionUpdate(input: $input) {
      //         collection {
      //           id
      //           handle
      //         }
      //         userErrors {
      //           field
      //           message
      //         }
      //       }
      //     }`,
      //     {
      //       variables: {
      //         input: { id: c.id, handle: stripGenderFromHandle(c.handle) },
      //       },
      //     },
      //   );
      //   const { data } = await res.json();
      //   console.log("collectionUpdate result:", JSON.stringify(data));
      // }

      logs = (await syncCollections(admin)) || [];
    } else if (body.action === "translate-collections") {
      logs = (await translateExistingCollections(admin)) || [];
    } else if (body.action === "sync-brands") {
      logs = (await syncBrandCollections(admin)) || [];
    } else if (body.action === "sync-products") {
      const limit = body.limit ? Number(body.limit) : undefined;
      const since = body.since ? new Date(body.since as string) : undefined;
      logs =
        (await syncProducts(session.shop, session.accessToken!, limit, false, since)) || [];
    } else if (body.action === "reset-sync-products") {
      const limit = body.limit ? Number(body.limit) : undefined;
      const since = body.since ? new Date(body.since as string) : undefined;
      logs =
        (await syncProducts(session.shop, session.accessToken!, limit, true, since)) ||
        [];
    } else if (body.action === "update-product-links") {
      const limit = body.limit ? Number(body.limit) : undefined;
      const offset = body.offset ? Number(body.offset) : 0;
      const result = await updateExistingProductLinks(
        session.accessToken!,
        session.shop,
        limit,
        offset,
      );
      logs = result.logs;
    } else if (body.action === "fix-handles") {
      const limit = body.limit ? Number(body.limit) : undefined;
      const offset = body.offset ? Number(body.offset) : 0;
      const dryRun = false;
      const result = await updateProductHandles(
        session.accessToken!,
        session.shop,
        limit,
        offset,
        dryRun,
      );
      logs = result.logs;
    } else if (body.action === "fix-handles-parallel") {
      const batches = body.batches ? Number(body.batches) : 10;
      const result = await updateProductHandlesParallel(
        session.accessToken!,
        session.shop,
        batches,
        false,
      );
      logs = result.logs;
    } else if (body.action === "fix-titles") {
      const limit = body.limit ? Number(body.limit) : undefined;
      const offset = body.offset ? Number(body.offset) : 0;
      const result = await updateProductTitles(
        session.accessToken!,
        session.shop,
        limit,
        offset,
      );
      logs = result.logs;
    } else if (body.action === "fix-titles-parallel") {
      const batches = body.batches ? Number(body.batches) : 10;
      const result = await updateProductTitlesParallel(
        session.accessToken!,
        session.shop,
        batches,
      );
      logs = result.logs;
    } else if (body.action === "sync-customers") {
      const limit = body.limit ? Number(body.limit) : undefined;
      logs =
        (await syncCustomers(session.shop, session.accessToken!, limit)) || [];
    } else if (body.action === "debug-product-links") {
      const productId = Number(body.productId);
      logs.push(`=== Debug product links for local ID: ${productId} ===`);

      // 1. Check productMap, fall back to SKU lookup
      let shopifyProductId: string | null = null;
      const map = await prisma.productMap.findFirst({ where: { localProductId: productId } });
      if (map) {
        shopifyProductId = map.shopifyProductId;
        logs.push(`✓ ProductMap: ${shopifyProductId}`);
      } else {
        const product = await externalDB.bc_product.findUnique({
          where: { product_id: productId },
          select: { model: true },
        });
        if (product) {
          shopifyProductId = await findShopifyProductBySku(product.model, session.accessToken!, session.shop);
          if (shopifyProductId) {
            logs.push(`✓ Found in Shopify via SKU (${product.model}): ${shopifyProductId}`);
            logs.push(`  ⚠ Not in ProductMap — will be backfilled on next link update run`);
          } else {
            logs.push(`✗ model=${product.model} — not found in Shopify`);
          }
        } else {
          logs.push(`✗ Not found in external DB`);
        }
      }

      if (shopifyProductId) {

        // 2. Bound products (bc_product_related_article)
        const boundArticles = await externalDB.bc_product_related_article.findMany({
          where: { article_id: productId },
        });
        logs.push(`\nBound articles in DB: ${boundArticles.length}`);
        for (const article of boundArticles) {
          const rel = await externalDB.bc_product.findUnique({
            where: { product_id: article.product_id },
            select: { product_id: true, model: true },
          });
          if (!rel) {
            logs.push(`  [${article.product_id}] ✗ Not found in external DB`);
            continue;
          }
          const shopifyId = await findShopifyProductBySku(rel.model, session.accessToken!, session.shop);
          if (shopifyId) {
            logs.push(`  [${rel.product_id}] model=${rel.model} → ✓ ${shopifyId}`);
          } else {
            logs.push(`  [${rel.product_id}] model=${rel.model} → ✗ NOT in Shopify`);
          }
        }

        // 3. Related products (bc_product_related)
        const relatedRows = await externalDB.bc_product_related.findMany({
          where: { product_id: productId },
        });
        logs.push(`\nRelated products in DB: ${relatedRows.length}`);
        for (const row of relatedRows) {
          const rel = await externalDB.bc_product.findUnique({
            where: { product_id: row.related_id },
            select: { product_id: true, model: true },
          });
          if (!rel) {
            logs.push(`  [${row.related_id}] ✗ Not found in external DB`);
            continue;
          }
          const shopifyId = await findShopifyProductBySku(rel.model, session.accessToken!, session.shop);
          if (shopifyId) {
            logs.push(`  [${row.related_id}] model=${rel.model} → ✓ ${shopifyId}`);
          } else {
            logs.push(`  [${row.related_id}] model=${rel.model} → ✗ NOT in Shopify`);
          }
        }
      }
    } else if (body.action === "revalidate-menu") {
      await revalidateNextJs({ type: "menu" });
      logs.push("Menu cache revalidated on miomio.com.ua");
    } else if (body.action === "sync-orders") {
      const limit = body.limit ? Number(body.limit) : undefined;
      const dateFrom = body.since ? new Date(body.since) : undefined;
      const result = await syncOrders(session.shop, session.accessToken!, limit, dateFrom);
      logs = result.logs;
    } else if (body.action === "delete-all-customers") {
      logs.push("Fetching all customers from Shopify...");
      let deletedCount = 0;
      let hasNextPage = true;
      let cursor: string | null = null;

      while (hasNextPage) {
        const listResponse = await admin.graphql(
          `
          query customers($after: String) {
            customers(first: 100, after: $after) {
              nodes { id }
              pageInfo { hasNextPage endCursor }
            }
          }
        `,
          { variables: { after: cursor } },
        );
        const { data } = await listResponse.json();
        const customers = data.customers.nodes;

        if (customers.length === 0) break;

        for (const c of customers) {
          try {
            await admin.graphql(
              `
              mutation customerDelete($id: ID!) {
                customerDelete(input: { id: $id }) {
                  deletedCustomerId
                  userErrors { field message }
                }
              }
            `,
              { variables: { id: c.id } },
            );
            deletedCount++;
          } catch (e: any) {
            logs.push(`Error deleting ${c.id}: ${e.message}`);
          }
        }

        logs.push(`Deleted ${deletedCount} customers so far...`);
        hasNextPage = data.customers.pageInfo.hasNextPage;
        cursor = data.customers.pageInfo.endCursor;
      }

      await prisma.customerMap.deleteMany();
      logs.push(`Deleted ${deletedCount} customers from Shopify`);
      logs.push("Cleared CustomerMap table");
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
      console.log(
        "discountAutomaticAppCreate result:",
        JSON.stringify(createData),
      );
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
    } else if (body.action === "check-url-issues") {
      const QUERY = `query getProducts($cursor: String) {
        products(first: 250, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes { id handle title }
        }
      }`;
      const withSpaces: string[] = [];
      const withDoubleSlash: string[] = [];
      const withLeadingSlash: string[] = [];
      const withTrailingSlash: string[] = [];
      let cursor: string | null = null;
      let total = 0;
      do {
        const res = await admin.graphql(QUERY, { variables: { cursor } });
        const { data } = await res.json();
        const products: Array<{ id: string; handle: string; title: string }> = data?.products?.nodes ?? [];
        const pageInfo = data?.products?.pageInfo;
        total += products.length;
        for (const p of products) {
          const fmt = `${p.handle}  |  ${p.title}`;
          if (/ /.test(p.handle))                         withSpaces.push(fmt);
          if (/\/\//.test(`/product/${p.handle}`))        withDoubleSlash.push(fmt);
          if (p.handle.startsWith("/"))                    withLeadingSlash.push(fmt);
          if (p.handle.endsWith("/"))                      withTrailingSlash.push(fmt);
        }
        cursor = pageInfo?.hasNextPage ? pageInfo.endCursor : null;
      } while (cursor);
      logs.push(`Scanned ${total} products.`);
      logs.push(`--- Spaces in handle (${withSpaces.length}) ---`);
      withSpaces.forEach((l) => logs.push("  " + l));
      logs.push(`--- Double slashes (${withDoubleSlash.length}) ---`);
      withDoubleSlash.forEach((l) => logs.push("  " + l));
      logs.push(`--- Leading slash (${withLeadingSlash.length}) ---`);
      withLeadingSlash.forEach((l) => logs.push("  " + l));
      logs.push(`--- Trailing slash (${withTrailingSlash.length}) ---`);
      withTrailingSlash.forEach((l) => logs.push("  " + l));
      const issues = withSpaces.length + withDoubleSlash.length + withLeadingSlash.length + withTrailingSlash.length;
      logs.push(issues === 0 ? "✓ No URL issues found." : `⚠ ${issues} issue(s) found.`);
    } else if (body.action === "compare-products") {
      const includeInactive = body.includeInactive === true;
      logs = await compareProducts(admin, includeInactive);
    } else if (body.action === "fix-orphaned-maps") {
      logs = await fixOrphanedMaps(admin);
    } else if (body.action === "sync-missing-products") {
      logs = await syncMissingProducts(admin, session);
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
          logs.push(
            `Deleted: ${deleteData.discountAutomaticDelete.deletedAutomaticDiscountId}`,
          );
        }
      }
    }
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    logs.push(`--- Done in ${elapsed}s ---`);
    return { success: true, logs, action: body.action };
  } catch (e: any) {
    console.error(JSON.stringify(e));
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    logs = e.logs || [e.message];
    logs.push(`--- Failed after ${elapsed}s ---`);
    return { success: false, logs, action: body.action };
  }
};

export default function Index() {
  const stats = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const [debugProductId, setDebugProductId] = useState("6729");
  const [productLimit, setProductLimit] = useState("5");
  const [updateLinksLimit, setUpdateLinksLimit] = useState("100");
  const [updateLinksOffset, setUpdateLinksOffset] = useState("0");
  const [fixHandlesLimit, setFixHandlesLimit] = useState("100");
  const [syncSince, setSyncSince] = useState("2026-02-25");
  const [fixHandlesOffset, setFixHandlesOffset] = useState("0");
  const [fixTitlesLimit, setFixTitlesLimit] = useState("100");
  const [fixTitlesOffset, setFixTitlesOffset] = useState("0");
  const [customerLimit, setCustomerLimit] = useState("5");
  const [orderLimit, setOrderLimit] = useState("5");
  const [orderSince, setOrderSince] = useState("");
  const isLoading = fetcher.state !== "idle";

  const handleAction = (action: string, limit?: string, offset?: string, since?: string) => {
    const payload: Record<string, string> = { action };
    if (limit) payload.limit = limit;
    if (offset) payload.offset = offset;
    if (since) payload.since = since;
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
            label="Since date"
            type="date"
            value={syncSince}
            onInput={(e: any) => setSyncSince(e.target.value)}
            help-text="Only sync products modified after this date"
          ></s-text-field>
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
            onClick={() => handleAction("sync-products", productLimit, undefined, syncSince)}
            disabled={isLoading || undefined}
          >
            {isLoading && fetcher.json?.action === "sync-products" && fetcher.json?.limit
              ? "Syncing..."
              : `Sync ${productLimit || "N"} since ${syncSince}`}
          </s-button>
          <s-button
            variant="primary"
            tone="critical"
            onClick={() => handleAction("sync-products", undefined, undefined, syncSince)}
            disabled={isLoading || undefined}
          >
            {isLoading && fetcher.json?.action === "sync-products" && !fetcher.json?.limit
              ? "Syncing all..."
              : `Sync ALL since ${syncSince}`}
          </s-button>
        </div>
        <div
          style={{
            marginTop: "16px",
            borderTop: "1px solid #e5e7eb",
            paddingTop: "12px",
          }}
        >
          <div style={{ marginBottom: "8px", color: "#666", fontSize: "13px" }}>
            Reset sync — forces <code>productSet</code> for all products
            (re-syncs variants, price &amp; inventory even for existing
            products)
          </div>
          <div
            style={{ display: "flex", gap: "8px", flexWrap: "wrap" as const }}
          >
            <s-button
              tone="critical"
              onClick={() => handleAction("reset-sync-products", productLimit)}
              disabled={isLoading || undefined}
            >
              {isLoading &&
              fetcher.json?.action === "reset-sync-products" &&
              fetcher.json?.limit
                ? "Resetting..."
                : `Reset Sync ${productLimit || "N"} Products`}
            </s-button>
            <s-button
              tone="critical"
              onClick={() => handleAction("reset-sync-products")}
              disabled={isLoading || undefined}
            >
              {isLoading &&
              fetcher.json?.action === "reset-sync-products" &&
              !fetcher.json?.limit
                ? "Resetting all..."
                : `Reset Sync ALL`}
            </s-button>
          </div>
        </div>
      </s-section>

      <s-section heading="Debug Product Links">
        <div style={{ marginBottom: "12px", color: "#666", fontSize: "14px" }}>
          Dry-run: shows what bound/related links would be set for a single product
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "flex-end", flexWrap: "wrap" as const }}>
          <s-text-field
            label="Local Product ID"
            type="number"
            value={debugProductId}
            min="1"
            onInput={(e: any) => setDebugProductId(e.target.value)}
            help-text="e.g. 6729"
          ></s-text-field>
          <s-button
            variant="primary"
            onClick={() => fetcher.submit(
              { action: "debug-product-links", productId: debugProductId },
              { method: "post", encType: "application/json" },
            )}
            disabled={isLoading || undefined}
          >
            {isLoading && fetcher.json?.action === "debug-product-links" ? "Checking..." : "Debug Links"}
          </s-button>
        </div>
      </s-section>

      <s-section heading="Update Product Links (Metafields)">
        <div style={{ marginBottom: "12px", color: "#666", fontSize: "14px" }}>
          Updates metafields (bound-products & recommended_products) for
          existing products
        </div>
        <div
          style={{
            display: "flex",
            gap: "8px",
            alignItems: "flex-end",
            flexWrap: "wrap" as const,
          }}
        >
          <s-text-field
            label="Limit"
            type="number"
            value={updateLinksLimit}
            min="1"
            onInput={(e: any) => setUpdateLinksLimit(e.target.value)}
            help-text="Number of products to update"
          ></s-text-field>
          <s-text-field
            label="Offset"
            type="number"
            value={updateLinksOffset}
            min="0"
            onInput={(e: any) => setUpdateLinksOffset(e.target.value)}
            help-text="Skip first N products"
          ></s-text-field>
          <s-button
            variant="primary"
            onClick={() =>
              handleAction(
                "update-product-links",
                updateLinksLimit,
                updateLinksOffset,
              )
            }
            disabled={isLoading || undefined}
          >
            {isLoading && fetcher.json?.action === "update-product-links"
              ? "Updating..."
              : `Update ${updateLinksLimit} Products`}
          </s-button>
          <s-button
            variant="primary"
            tone="critical"
            onClick={() => handleAction("update-product-links")}
            disabled={isLoading || undefined}
          >
            {isLoading &&
            fetcher.json?.action === "update-product-links" &&
            !fetcher.json?.limit
              ? "Updating all..."
              : `Update ALL (${stats.syncedCount})`}
          </s-button>
        </div>
      </s-section>

      <s-section heading="Fix Product Handles (Remove Brand)">
        <div style={{ marginBottom: "12px", color: "#666", fontSize: "14px" }}>
          Removes brand slug from product handles (e.g. krosivky-ash-movie →
          krosivky-movie)
        </div>
        <div
          style={{
            display: "flex",
            gap: "8px",
            alignItems: "flex-end",
            flexWrap: "wrap" as const,
          }}
        >
          <s-text-field
            label="Limit"
            type="number"
            value={fixHandlesLimit}
            min="1"
            onInput={(e: any) => setFixHandlesLimit(e.target.value)}
            help-text="Number of products to process"
          ></s-text-field>
          <s-text-field
            label="Offset"
            type="number"
            value={fixHandlesOffset}
            min="0"
            onInput={(e: any) => setFixHandlesOffset(e.target.value)}
            help-text="Skip first N products"
          ></s-text-field>
          <s-button
            variant="primary"
            onClick={() =>
              handleAction("fix-handles", fixHandlesLimit, fixHandlesOffset)
            }
            disabled={isLoading || undefined}
          >
            {isLoading &&
            fetcher.json?.action === "fix-handles" &&
            fetcher.json?.limit
              ? "Fixing..."
              : `Fix ${fixHandlesLimit} Products`}
          </s-button>
          <s-button
            variant="primary"
            tone="critical"
            onClick={() => handleAction("fix-handles")}
            disabled={isLoading || undefined}
          >
            {isLoading &&
            fetcher.json?.action === "fix-handles" &&
            !fetcher.json?.limit
              ? "Fixing all..."
              : `Fix ALL Handles`}
          </s-button>
          <s-button
            variant="primary"
            tone="critical"
            onClick={() =>
              fetcher.submit(
                { action: "fix-handles-parallel", batches: "10" },
                { method: "post", encType: "application/json" },
              )
            }
            disabled={isLoading || undefined}
          >
            {isLoading && fetcher.json?.action === "fix-handles-parallel"
              ? "Fixing (10 workers)..."
              : "Fix ALL Handles (10 parallel)"}
          </s-button>
        </div>
      </s-section>

      <s-section heading="Fix Product Titles (Remove Brand)">
        <div style={{ marginBottom: "12px", color: "#666", fontSize: "14px" }}>
          Re-computes product titles by removing brand name and model SKU
        </div>
        <div
          style={{
            display: "flex",
            gap: "8px",
            alignItems: "flex-end",
            flexWrap: "wrap" as const,
          }}
        >
          <s-text-field
            label="Limit"
            type="number"
            value={fixTitlesLimit}
            min="1"
            onInput={(e: any) => setFixTitlesLimit(e.target.value)}
            help-text="Number of products to process"
          />
          <s-text-field
            label="Offset"
            type="number"
            value={fixTitlesOffset}
            min="0"
            onInput={(e: any) => setFixTitlesOffset(e.target.value)}
            help-text="Skip first N products"
          />
          <s-button
            variant="primary"
            onClick={() =>
              handleAction("fix-titles", fixTitlesLimit, fixTitlesOffset)
            }
            disabled={isLoading || undefined}
          >
            {isLoading &&
            fetcher.json?.action === "fix-titles" &&
            fetcher.json?.limit
              ? "Fixing..."
              : `Fix ${fixTitlesLimit} Titles`}
          </s-button>
          <s-button
            variant="primary"
            tone="critical"
            onClick={() => handleAction("fix-titles")}
            disabled={isLoading || undefined}
          >
            {isLoading &&
            fetcher.json?.action === "fix-titles" &&
            !fetcher.json?.limit
              ? "Fixing all..."
              : "Fix ALL Titles"}
          </s-button>
          <s-button
            variant="primary"
            tone="critical"
            onClick={() =>
              fetcher.submit(
                { action: "fix-titles-parallel", batches: "10" },
                { method: "post", encType: "application/json" },
              )
            }
            disabled={isLoading || undefined}
          >
            {isLoading && fetcher.json?.action === "fix-titles-parallel"
              ? "Fixing (10 workers)..."
              : "Fix ALL Titles (10 parallel)"}
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
          <s-button
            tone="critical"
            onClick={() => handleAction("delete-all-customers")}
            disabled={isLoading || undefined}
          >
            {isLoading && fetcher.json?.action === "delete-all-customers"
              ? "Deleting all customers..."
              : "Delete ALL Customers"}
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
          <s-text-field
            label="Since date"
            type="date"
            value={orderSince}
            onInput={(e: any) => setOrderSince(e.target.value)}
            help-text="Filter by date_added >= date"
          ></s-text-field>
          <s-button
            variant="primary"
            onClick={() => handleAction("sync-orders", orderLimit, undefined, orderSince || undefined)}
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
            onClick={() => handleAction("sync-orders", undefined, undefined, new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))}
            disabled={isLoading || undefined}
          >
            {isLoading &&
            fetcher.json?.action === "sync-orders" &&
            fetcher.json?.since && !fetcher.json?.limit
              ? "Syncing last 3 months..."
              : `Sync last 3 months`}
          </s-button>
          <s-button
            variant="primary"
            tone="critical"
            onClick={() => handleAction("sync-orders")}
            disabled={isLoading || undefined}
          >
            {isLoading &&
            fetcher.json?.action === "sync-orders" &&
            !fetcher.json?.limit && !fetcher.json?.since
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
            onClick={() => handleAction("translate-collections")}
            disabled={isLoading || undefined}
          >
            {isLoading && fetcher.json?.action === "translate-collections"
              ? "Translating..."
              : "Translate Collections (RU)"}
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

      <s-section heading="Storefront Cache">
        <div style={{ marginBottom: "12px", color: "#666", fontSize: "14px" }}>
          Revalidate cached data on miomio.com.ua
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <s-button
            variant="primary"
            onClick={() => handleAction("revalidate-menu")}
            disabled={isLoading || undefined}
          >
            {isLoading && fetcher.json?.action === "revalidate-menu"
              ? "Revalidating..."
              : "Revalidate Menu"}
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

      <s-section heading="Compare Products (DB vs Shopify)">
        <div style={{ marginBottom: "12px", color: "#666", fontSize: "14px" }}>
          Compares external DB products with Shopify. Uses productMap first, falls back to SKU matching. Flags duplicate SKUs as ambiguous.
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" as const }}>
          <s-button
            variant="primary"
            onClick={() => handleAction("compare-products")}
            disabled={isLoading || undefined}
          >
            {isLoading && fetcher.json?.action === "compare-products" && !fetcher.json?.includeInactive
              ? "Comparing..."
              : "Compare (active only)"}
          </s-button>
          <s-button
            onClick={() =>
              fetcher.submit(
                { action: "compare-products", includeInactive: true },
                { method: "post", encType: "application/json" },
              )
            }
            disabled={isLoading || undefined}
          >
            {isLoading && fetcher.json?.action === "compare-products" && fetcher.json?.includeInactive
              ? "Comparing..."
              : "Compare (all incl. inactive)"}
          </s-button>
          <s-button
            tone="critical"
            onClick={() => handleAction("fix-orphaned-maps")}
            disabled={isLoading || undefined}
          >
            {isLoading && fetcher.json?.action === "fix-orphaned-maps"
              ? "Cleaning up..."
              : "Fix Orphaned Maps"}
          </s-button>
          <s-button
            variant="primary"
            tone="critical"
            onClick={() => handleAction("sync-missing-products")}
            disabled={isLoading || undefined}
          >
            {isLoading && fetcher.json?.action === "sync-missing-products"
              ? "Syncing missing..."
              : "Sync Missing Products"}
          </s-button>
        </div>
      </s-section>

      <s-section heading="SEO URL Checker">
        <div style={{ marginBottom: "12px", color: "#666", fontSize: "14px" }}>
          Scans all Shopify product handles for spaces, double slashes, leading/trailing slashes
        </div>
        <s-button
          variant="primary"
          onClick={() => handleAction("check-url-issues")}
          disabled={isLoading || undefined}
        >
          {isLoading && fetcher.json?.action === "check-url-issues"
            ? "Scanning..."
            : "Check URL Issues"}
        </s-button>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
