import { prisma } from "@shared/lib/prisma/prisma.server";
import { Decimal } from "@prisma/client/runtime/library";
import { sendPriceDropEventToEsputnik } from "@/service/esputnik/esputnik-price.service";

interface ProductVariant {
  id: number;
  product_id: number;
  price: string;
  compare_at_price: string | null;
  sku: string;
  title: string;
  inventory_quantity?: number;
  inventory_policy?: string;
}

interface ProductPayload {
  id: number;
  title: string;
  handle: string;
  status?: string;
  variants: ProductVariant[];
}

export async function processPriceUpdate(
  shop: string,
  product: ProductPayload
): Promise<void> {
  const shopifyProductId = `gid://shopify/Product/${product.id}`;

  console.log(`Processing price update for product ${product.id} (${product.title})`);

  for (const variant of product.variants) {
    const shopifyVariantId = `gid://shopify/ProductVariant/${variant.id}`;
    const currentPrice = new Decimal(variant.price);
    const compareAtPrice = variant.compare_at_price
      ? new Decimal(variant.compare_at_price)
      : null;

    // Check inventory status
    const isInStock =
      variant.inventory_quantity === undefined ||
      variant.inventory_quantity > 0 ||
      variant.inventory_policy === "continue";

    // Get the last recorded price for this variant
    const lastPrice = await prisma.priceHistory.findFirst({
      where: { shopifyVariantId },
      orderBy: { recordedAt: "desc" },
    });

    // Only record if price changed or no history exists
    const priceChanged =
      !lastPrice || !lastPrice.price.equals(currentPrice);

    if (priceChanged) {
      console.log(
        `Price changed for variant ${variant.id}: ${lastPrice?.price.toString() || "N/A"} -> ${currentPrice.toString()}`
      );

      // Record new price in history
      await prisma.priceHistory.create({
        data: {
          shopifyProductId,
          shopifyVariantId,
          price: currentPrice,
          compareAtPrice,
          currencyCode: "UAH",
        },
      });

      // Notify on any price change regardless of stock status
      await checkAndNotifySubscriptions(
        shopifyProductId,
        shopifyVariantId,
        currentPrice,
        product.title,
        variant.title
      );
    }

    // Check for back-in-stock notifications
    if (isInStock) {
      await checkAndNotifyBackInStock(
        shopifyProductId,
        shopifyVariantId,
        currentPrice,
        product.title,
        variant.title
      );
    }
  }
}

// Check and notify subscriptions waiting for back-in-stock
async function checkAndNotifyBackInStock(
  shopifyProductId: string,
  shopifyVariantId: string,
  currentPrice: Decimal,
  productTitle?: string,
  variantTitle?: string
): Promise<void> {
  console.log(`[checkAndNotifyBackInStock] Checking for BACK_IN_STOCK subscriptions for product ${shopifyProductId}, variant ${shopifyVariantId}`);
  // Find BACK_IN_STOCK subscriptions
  const subscriptions = await prisma.priceSubscription.findMany({
    where: {
      isActive: true,
      subscriptionType: "BACK_IN_STOCK",
      shopifyProductId,
    },
  });

  console.log(`[checkAndNotifyBackInStock] Found ${subscriptions.length} BACK_IN_STOCK subscriptions.`);

  if (subscriptions.length > 0) {
    console.log(
      `Found ${subscriptions.length} back-in-stock subscriptions to check`
    );

    for (const subscription of subscriptions) {
      try {
        await sendPriceDropEventToEsputnik({
          email: subscription.email,
          productId: shopifyProductId,
          productTitle,
          variantTitle,
          newPrice: currentPrice.toString(),
          subscriptionId: subscription.id,
        });
        console.log(`eSputnik back-in-stock event sent for subscription ${subscription.id} (${subscription.email})`);
      } catch (error) {
        console.warn(`Failed to send eSputnik back-in-stock event for ${subscription.email}:`, error);
      }
    }
  }
}

async function checkAndNotifySubscriptions(
  shopifyProductId: string,
  shopifyVariantId: string,
  currentPrice: Decimal,
  productTitle?: string,
  variantTitle?: string
): Promise<void> {
  console.log(`[checkAndNotifySubscriptions] Checking for PRICE_DROP/ANY_CHANGE subscriptions for product ${shopifyProductId}, variant ${shopifyVariantId} at price ${currentPrice.toString()}`);
  // Find active PRICE_DROP subscriptions where target price is met
  const priceDropSubscriptions = await prisma.priceSubscription.findMany({
    where: {
      isActive: true,
      notifiedAt: null,
      subscriptionType: "PRICE_DROP",
      shopifyProductId,
      targetPrice: {
        gte: currentPrice,
      },
    },
  });
  console.log(`[checkAndNotifySubscriptions] Found ${priceDropSubscriptions.length} PRICE_DROP subscriptions meeting criteria.`);

  // Find active ANY_CHANGE subscriptions
  const anyChangeSubscriptions = await prisma.priceSubscription.findMany({
    where: {
      isActive: true,
      subscriptionType: "ANY_CHANGE",
      shopifyProductId,
    },
  });
  console.log(`[checkAndNotifySubscriptions] Found ${anyChangeSubscriptions.length} ANY_CHANGE subscriptions.`);

  const subscriptions = [...priceDropSubscriptions, ...anyChangeSubscriptions];

  if (subscriptions.length > 0) {
    console.log(
      `Found ${subscriptions.length} subscriptions to notify for price ${currentPrice.toString()}`
    );

    for (const subscription of subscriptions) {
      try {
        await sendPriceDropEventToEsputnik({
          email: subscription.email,
          productId: shopifyProductId,
          productTitle,
          variantTitle,
          newPrice: currentPrice.toString(),
          subscriptionId: subscription.id,
        });
        console.log(`eSputnik event sent for subscription ${subscription.id} (${subscription.email})`);
      } catch (error) {
        console.warn(`Failed to send eSputnik event for ${subscription.email}:`, error);
      }
    }
  }
}

// API functions for external use

type SubscriptionType = "PRICE_DROP" | "BACK_IN_STOCK" | "ANY_CHANGE";

export async function createPriceSubscription(data: {
  email: string;
  shopifyProductId: string;
  shopifyVariantId?: string;
  subscriptionType?: SubscriptionType;
  targetPrice?: number;
}) {
  return prisma.priceSubscription.create({
    data: {
      email: data.email,
      shopifyProductId: data.shopifyProductId,
      shopifyVariantId: data.shopifyVariantId || null,
      subscriptionType: data.subscriptionType || "PRICE_DROP",
      targetPrice: data.targetPrice ? new Decimal(data.targetPrice) : null,
    },
  });
}

export async function getPriceHistory(
  shopifyProductId: string,
  shopifyVariantId?: string,
  limit = 30
) {
  return prisma.priceHistory.findMany({
    where: {
      shopifyProductId,
      ...(shopifyVariantId && { shopifyVariantId }),
    },
    orderBy: { recordedAt: "desc" },
    take: limit,
  });
}

export async function getCurrentPrices(shopifyProductId: string) {
  // Get distinct variant IDs for this product
  const variants = await prisma.priceHistory.findMany({
    where: { shopifyProductId },
    select: { shopifyVariantId: true },
    distinct: ["shopifyVariantId"],
  });

  // Get latest price for each variant
  const prices = await Promise.all(
    variants.map(async ({ shopifyVariantId }) => {
      const latestPrice = await prisma.priceHistory.findFirst({
        where: { shopifyProductId, shopifyVariantId },
        orderBy: { recordedAt: "desc" },
      });
      return latestPrice;
    })
  );

  return prices.filter(Boolean);
}

export async function getSubscriptionsByEmail(email: string) {
  return prisma.priceSubscription.findMany({
    where: { email, isActive: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function cancelSubscription(id: string, email: string) {
  return prisma.priceSubscription.updateMany({
    where: { id, email },
    data: { isActive: false },
  });
}
