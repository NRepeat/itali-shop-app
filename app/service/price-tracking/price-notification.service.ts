import { prisma } from "@shared/lib/prisma/prisma.server";
import {
  priceNotificationQueue,
  type PriceNotificationJobData,
} from "@shared/lib/queue/price-notification.queue";
import { createHash } from "crypto";

// Generate unsubscribe token from subscription ID and email
export function generateUnsubscribeToken(
  subscriptionId: string,
  email: string
): string {
  const secret = process.env.UNSUBSCRIBE_SECRET || "default-secret";
  return createHash("sha256")
    .update(`${subscriptionId}:${email}:${secret}`)
    .digest("hex")
    .slice(0, 32);
}

// Verify unsubscribe token
export function verifyUnsubscribeToken(
  subscriptionId: string,
  email: string,
  token: string
): boolean {
  const expectedToken = generateUnsubscribeToken(subscriptionId, email);
  return token === expectedToken;
}

// Queue a notification for a subscription
export async function queuePriceNotification(
  subscriptionId: string,
  currentPrice: string,
  productTitle?: string,
  variantTitle?: string
): Promise<void> {
  const subscription = await prisma.priceSubscription.findUnique({
    where: { id: subscriptionId },
  });

  if (!subscription || !subscription.isActive) {
    console.log(`Subscription ${subscriptionId} not found or inactive`);
    return;
  }

  const jobData: PriceNotificationJobData = {
    subscriptionId: subscription.id,
    email: subscription.email,
    shopifyProductId: subscription.shopifyProductId,
    shopifyVariantId: subscription.shopifyVariantId,
    currentPrice,
    targetPrice: subscription.targetPrice?.toString() || null,
    productTitle,
    variantTitle,
  };

  await priceNotificationQueue.add("send-notification", jobData, {
    jobId: `notification-${subscriptionId}-${Date.now()}`,
  });

  console.log(`Queued notification for subscription ${subscriptionId}`);
}

// Process pending notifications - called by worker
export async function processPendingNotifications(): Promise<number> {
  // Find subscriptions that have been marked for notification but not yet processed
  const pendingSubscriptions = await prisma.priceSubscription.findMany({
    where: {
      isActive: true,
      notifiedAt: {
        not: null,
        // Only process notifications from the last hour that haven't been sent
        gte: new Date(Date.now() - 60 * 60 * 1000),
      },
    },
  });

  console.log(`Found ${pendingSubscriptions.length} pending notifications`);

  for (const subscription of pendingSubscriptions) {
    // Get the latest price for this product/variant
    const latestPrice = await prisma.priceHistory.findFirst({
      where: {
        shopifyProductId: subscription.shopifyProductId,
        ...(subscription.shopifyVariantId && {
          shopifyVariantId: subscription.shopifyVariantId,
        }),
      },
      orderBy: { recordedAt: "desc" },
    });

    if (latestPrice) {
      await queuePriceNotification(
        subscription.id,
        latestPrice.price.toString()
      );
    }
  }

  return pendingSubscriptions.length;
}

// Send email notification (placeholder - implement with actual email service)
export async function sendPriceNotificationEmail(
  data: PriceNotificationJobData
): Promise<void> {
  const unsubscribeToken = generateUnsubscribeToken(
    data.subscriptionId,
    data.email
  );

  const baseUrl = process.env.SHOPIFY_APP_URL || "http://localhost:3000";
  const unsubscribeUrl = `${baseUrl}/api/unsubscribe?id=${data.subscriptionId}&email=${encodeURIComponent(data.email)}&token=${unsubscribeToken}`;

  // TODO: Implement actual email sending with your email service
  // Examples: SendGrid, AWS SES, Mailgun, etc.

  console.log("=== PRICE DROP NOTIFICATION ===");
  console.log(`To: ${data.email}`);
  console.log(`Product: ${data.productTitle || data.shopifyProductId}`);
  console.log(`Variant: ${data.variantTitle || data.shopifyVariantId || "N/A"}`);
  console.log(`Current Price: ${data.currentPrice} UAH`);
  console.log(`Target Price: ${data.targetPrice || "Any drop"}`);
  console.log(`Unsubscribe: ${unsubscribeUrl}`);
  console.log("================================");

  // Mark subscription as processed (set notifiedAt to null to prevent re-sending)
  // Or you can deactivate it if it's a one-time notification
  await prisma.priceSubscription.update({
    where: { id: data.subscriptionId },
    data: {
      // Keep active for continuous monitoring, or set isActive: false for one-time alerts
      notifiedAt: new Date(),
    },
  });
}

// Unsubscribe with token verification
export async function unsubscribeWithToken(
  subscriptionId: string,
  email: string,
  token: string
): Promise<{ success: boolean; error?: string }> {
  if (!verifyUnsubscribeToken(subscriptionId, email, token)) {
    return { success: false, error: "Invalid unsubscribe token" };
  }

  const subscription = await prisma.priceSubscription.findFirst({
    where: { id: subscriptionId, email },
  });

  if (!subscription) {
    return { success: false, error: "Subscription not found" };
  }

  await prisma.priceSubscription.update({
    where: { id: subscriptionId },
    data: { isActive: false },
  });

  return { success: true };
}
