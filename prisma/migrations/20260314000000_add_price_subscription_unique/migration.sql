-- Remove duplicate rows before adding unique constraint (keep the most recent one)
DELETE FROM "PriceSubscription" a
USING "PriceSubscription" b
WHERE a."createdAt" < b."createdAt"
  AND a."email" = b."email"
  AND a."shopifyProductId" = b."shopifyProductId"
  AND a."subscriptionType" = b."subscriptionType";

-- CreateIndex
CREATE UNIQUE INDEX "PriceSubscription_email_shopifyProductId_subscriptionType_key"
ON "PriceSubscription"("email", "shopifyProductId", "subscriptionType");
