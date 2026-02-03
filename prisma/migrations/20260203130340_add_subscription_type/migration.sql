-- CreateEnum
CREATE TYPE "SubscriptionType" AS ENUM ('PRICE_DROP', 'BACK_IN_STOCK', 'ANY_CHANGE');

-- AlterTable
ALTER TABLE "PriceSubscription" ADD COLUMN     "subscriptionType" "SubscriptionType" NOT NULL DEFAULT 'PRICE_DROP';

-- CreateIndex
CREATE INDEX "PriceSubscription_subscriptionType_idx" ON "PriceSubscription"("subscriptionType");
