import { getCurrentPrices, getPriceHistory } from "@/service/price-tracking/price-tracking.service";
import { checkProductExistsById } from "@/service/shopify/products/api/check-product-exists";
import type { LoaderFunctionArgs } from "react-router";


// GET /api/prices/:productId?variantId=xxx&history=true&limit=30
export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  const { productId } = params;

  if (!productId) {
    return Response.json(
      { error: "Product ID is required" },
      { status: 400 }
    );
  }

  // Convert numeric ID to GID if needed
  const shopifyProductId = productId.startsWith("gid://")
    ? productId
    : `gid://shopify/Product/${productId}`;

  // Check if product exists in Shopify
  const productExists = await checkProductExistsById(shopifyProductId);

  if (!productExists) {
    return Response.json(
      { error: "Product not found in Shopify" },
      { status: 404 }
    );
  }

  const url = new URL(request.url);
  const variantId = url.searchParams.get("variantId");
  const includeHistory = url.searchParams.get("history") === "true";
  const limit = parseInt(url.searchParams.get("limit") || "30", 10);

  // Convert variant ID to GID if provided
  const shopifyVariantId =
    variantId && !variantId.startsWith("gid://")
      ? `gid://shopify/ProductVariant/${variantId}`
      : variantId || undefined;

  try {
    if (includeHistory) {
      const history = await getPriceHistory(
        shopifyProductId,
        shopifyVariantId,
        limit
      );

      return Response.json({
        productId: shopifyProductId,
        variantId: shopifyVariantId,
        history,
      });
    }

    // Return current prices for all variants
    const prices = await getCurrentPrices(shopifyProductId);

    return Response.json({
      productId: shopifyProductId,
      prices,
    });
  } catch (error) {
    console.error("Error fetching prices:", error);
    return Response.json(
      { error: "Failed to fetch prices" },
      { status: 500 }
    );
  }
};
