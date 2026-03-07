// POST /api/sync-product?model=7W000477&secret=SYNC_SECRET
// Force-syncs a single product by model/SKU — bypasses the quantity > 0 filter
// For qty=0 products: only zeros out inventory (safe, no productSet)
// For qty>0 products: full sync via processSyncTask

import type { ActionFunctionArgs } from "react-router";
import { prisma, externalDB } from "@shared/lib/prisma/prisma.server";
import { processSyncTask } from "@/service/sync/products/sync-product.worker";
import { findShopifyProductBySku } from "@/service/shopify/products/api/find-shopify-product";
import { client } from "@shared/lib/shopify/client/client";

const LOCATION_ID = process.env.SHOPIFY_LOCATION || "gid://shopify/Location/78249492642";

const GET_VARIANTS_QUERY = `
  query ($id: ID!) {
    product(id: $id) {
      variants(first: 100) {
        nodes { id inventoryItem { id } selectedOptions { name value } }
      }
    }
  }
`;

const INVENTORY_SET_MUTATION = `
  mutation ($input: InventorySetQuantitiesInput!) {
    inventorySetQuantities(input: $input) {
      inventoryAdjustmentGroup { reason }
      userErrors { field message }
    }
  }
`;

export const action = async ({ request }: ActionFunctionArgs) => {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");
  const model = url.searchParams.get("model");

  if (!secret || secret !== process.env.SYNC_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!model) {
    return Response.json({ error: "model param required" }, { status: 400 });
  }

  const session = await prisma.session.findFirst({
    orderBy: { id: "desc" },
  });
  if (!session?.accessToken) {
    return Response.json({ error: "No valid Shopify session found" }, { status: 500 });
  }

  const { shop, accessToken } = session;

  const product = await externalDB.bc_product.findFirst({
    where: { model },
    select: {
      product_id: true, model: true, sku: true, upc: true, ean: true,
      jan: true, isbn: true, mpn: true, location: true, quantity: true,
      stock_status_id: true, image: true, manufacturer_id: true, shipping: true,
      price: true, points: true, tax_class_id: true, weight: true,
      weight_class_id: true, length: true, width: true, height: true,
      length_class_id: true, subtract: true, minimum: true, sort_order: true,
      status: true, viewed: true, noindex: true, af_values: true, af_tags: true,
      extra_special: true, import_batch: true, meta_robots: true,
      seo_canonical: true, new: true, rasprodaja: true,
    },
  });

  if (!product) {
    return Response.json({ error: `Product "${model}" not found in external DB` }, { status: 404 });
  }

  console.log(`[ForceSyncProduct] model=${product.model} qty=${product.quantity}`);

  // qty=0: only zero-out inventory, don't touch product data
  if (product.quantity === 0) {
    const shopifyId = await findShopifyProductBySku(product.model, accessToken, shop);
    if (!shopifyId) {
      return Response.json({ error: `Product "${model}" not found in Shopify` }, { status: 404 });
    }

    const varRes = await client.request<{
      product: { variants: { nodes: Array<{ id: string; inventoryItem: { id: string }; selectedOptions: Array<{ name: string; value: string }> }> } } | null;
    }>({ query: GET_VARIANTS_QUERY, variables: { id: shopifyId }, accessToken, shopDomain: shop });

    const variants = varRes.product?.variants?.nodes ?? [];
    if (variants.length === 0) {
      return Response.json({ error: "No variants found in Shopify" }, { status: 500 });
    }

    const invRes = await client.request<{ inventorySetQuantities: { userErrors: Array<{ message: string }> } }>({
      query: INVENTORY_SET_MUTATION,
      variables: {
        input: {
          name: "available",
          reason: "correction",
          ignoreCompareQuantity: true,
          quantities: variants.map((v) => ({
            inventoryItemId: v.inventoryItem.id,
            locationId: LOCATION_ID,
            quantity: 0,
          })),
        },
      },
      accessToken,
      shopDomain: shop,
    });

    const errors = invRes.inventorySetQuantities?.userErrors ?? [];
    if (errors.length > 0) {
      return Response.json({ error: errors.map((e) => e.message).join(", ") }, { status: 500 });
    }

    const variantSummary = variants.map((v) => ({
      id: v.id,
      options: v.selectedOptions.map((o) => `${o.name}=${o.value}`).join(", "),
    }));

    console.log(`[ForceSyncProduct] Zeroed out ${variants.length} variants for ${shopifyId}`);
    return Response.json({ ok: true, action: "zero-out", shopifyId, variants: variantSummary });
  }

  // qty>0: full sync
  const fakeJob = {
    data: { product, domain: shop, shop, accessToken },
  };
  await processSyncTask(fakeJob as any);

  return Response.json({ ok: true, action: "full-sync", model: product.model, quantity: product.quantity });
};
