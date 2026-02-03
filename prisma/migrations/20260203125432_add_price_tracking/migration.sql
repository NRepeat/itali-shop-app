-- CreateTable
CREATE TABLE "PriceSubscription" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "shopifyProductId" TEXT NOT NULL,
    "shopifyVariantId" TEXT,
    "targetPrice" DECIMAL(10,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceHistory" (
    "id" TEXT NOT NULL,
    "shopifyProductId" TEXT NOT NULL,
    "shopifyVariantId" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "compareAtPrice" DECIMAL(10,2),
    "currencyCode" TEXT NOT NULL DEFAULT 'UAH',
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PriceSubscription_shopifyProductId_idx" ON "PriceSubscription"("shopifyProductId");

-- CreateIndex
CREATE INDEX "PriceSubscription_shopifyVariantId_idx" ON "PriceSubscription"("shopifyVariantId");

-- CreateIndex
CREATE INDEX "PriceSubscription_email_idx" ON "PriceSubscription"("email");

-- CreateIndex
CREATE INDEX "PriceHistory_shopifyProductId_idx" ON "PriceHistory"("shopifyProductId");

-- CreateIndex
CREATE INDEX "PriceHistory_shopifyVariantId_idx" ON "PriceHistory"("shopifyVariantId");

-- CreateIndex
CREATE INDEX "PriceHistory_recordedAt_idx" ON "PriceHistory"("recordedAt");
