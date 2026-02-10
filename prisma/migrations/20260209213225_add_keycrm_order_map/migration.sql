-- CreateTable
CREATE TABLE "KeyCrmOrderMap" (
    "id" TEXT NOT NULL,
    "shopifyOrderId" TEXT NOT NULL,
    "keycrmOrderId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KeyCrmOrderMap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KeyCrmOrderMap_shopifyOrderId_key" ON "KeyCrmOrderMap"("shopifyOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "KeyCrmOrderMap_keycrmOrderId_key" ON "KeyCrmOrderMap"("keycrmOrderId");
