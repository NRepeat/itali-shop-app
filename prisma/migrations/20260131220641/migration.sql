-- CreateTable
CREATE TABLE "CustomerMap" (
    "id" TEXT NOT NULL,
    "localCustomerId" INTEGER NOT NULL,
    "shopifyCustomerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderMap" (
    "id" TEXT NOT NULL,
    "localOrderId" INTEGER NOT NULL,
    "shopifyOrderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderMap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerMap_localCustomerId_key" ON "CustomerMap"("localCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerMap_shopifyCustomerId_key" ON "CustomerMap"("shopifyCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderMap_localOrderId_key" ON "OrderMap"("localOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderMap_shopifyOrderId_key" ON "OrderMap"("shopifyOrderId");
