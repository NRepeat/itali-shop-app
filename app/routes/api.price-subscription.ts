import { getSubscriptionsByEmail, createPriceSubscription, cancelSubscription } from "@/service/price-tracking/price-tracking.service";
import { checkProductExistsById } from "@/service/shopify/products/api/check-product-exists";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";



// GET /api/price-subscription?email=xxx
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const email = url.searchParams.get("email");

  if (!email) {
    return Response.json(
      { error: "Email is required" },
      { status: 400 }
    );
  }

  try {
    const subscriptions = await getSubscriptionsByEmail(email);
    return Response.json({ subscriptions });
  } catch (error) {
    console.error("Error fetching subscriptions:", error);
    return Response.json(
      { error: "Failed to fetch subscriptions" },
      { status: 500 }
    );
  }
};

// POST /api/price-subscription
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "POST") {
    return handleCreate(request);
  }

  if (request.method === "DELETE") {
    return handleDelete(request);
  }

  return Response.json(
    { error: "Method not allowed" },
    { status: 405 }
  );
};

async function handleCreate(request: Request) {
  try {
    const body = await request.json();

    const {
      email,
      shopifyProductId,
      shopifyVariantId,
      subscriptionType,
      targetPrice,
    } = body;

    if (!email || !shopifyProductId) {
      return Response.json(
        { error: "email and shopifyProductId are required" },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return Response.json(
        { error: "Invalid email format" },
        { status: 400 }
      );
    }

    // Validate subscription type
    const validTypes = ["PRICE_DROP", "BACK_IN_STOCK", "ANY_CHANGE"];
    if (subscriptionType && !validTypes.includes(subscriptionType)) {
      return Response.json(
        { error: `Invalid subscriptionType. Must be one of: ${validTypes.join(", ")}` },
        { status: 400 }
      );
    }

    // Check if product exists in Shopify
    const productExists = await checkProductExistsById(shopifyProductId);

    if (!productExists) {
      return Response.json(
        { error: "Product not found in Shopify" },
        { status: 404 }
      );
    }

    const subscription = await createPriceSubscription({
      email,
      shopifyProductId,
      shopifyVariantId,
      subscriptionType,
      targetPrice,
    });

    return Response.json({ subscription }, { status: 201 });
  } catch (error) {
    console.error("Error creating subscription:", error);
    return Response.json(
      { error: "Failed to create subscription" },
      { status: 500 }
    );
  }
}

async function handleDelete(request: Request) {
  try {
    const body = await request.json();
    const { id, email } = body;

    if (!id || !email) {
      return Response.json(
        { error: "id and email are required" },
        { status: 400 }
      );
    }

    await cancelSubscription(id, email);

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error canceling subscription:", error);
    return Response.json(
      { error: "Failed to cancel subscription" },
      { status: 500 }
    );
  }
}
