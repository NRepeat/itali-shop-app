-- CreateTable
CREATE TABLE "ProductMap" (
    "id" TEXT NOT NULL,
    "localProductId" INTEGER NOT NULL,
    "shopifyProductId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductMap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductMap_localProductId_key" ON "ProductMap"("localProductId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductMap_shopifyProductId_key" ON "ProductMap"("shopifyProductId");
