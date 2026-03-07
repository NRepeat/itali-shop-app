// POST /api/sync-product?model=7W000477&secret=SYNC_SECRET
// Force-syncs a single product by model/SKU — bypasses the quantity > 0 filter

import type { ActionFunctionArgs } from "react-router";
import { prisma, externalDB } from "@shared/lib/prisma/prisma.server";
import { processSyncTask } from "@/service/sync/products/sync-product.worker";

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
    where: { accessToken: { not: null } },
    orderBy: { id: "desc" },
  });

  if (!session?.accessToken) {
    return Response.json({ error: "No valid Shopify session found" }, { status: 500 });
  }

  const product = await externalDB.bc_product.findFirst({
    where: { model: { equals: model, mode: "insensitive" } },
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

  console.log(`[ForceSyncProduct] Syncing product ${product.product_id} (${product.model}) qty=${product.quantity}`);

  const fakeJob = {
    data: {
      product,
      domain: session.shop,
      shop: session.shop,
      accessToken: session.accessToken,
    },
  };

  await processSyncTask(fakeJob as any);

  return Response.json({
    ok: true,
    product_id: product.product_id,
    model: product.model,
    quantity: product.quantity,
    shop: session.shop,
  });
};
