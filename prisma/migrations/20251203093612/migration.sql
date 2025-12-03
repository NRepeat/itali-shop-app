-- CreateTable
CREATE TABLE "MetafieldDefinition" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "namespace" TEXT,
    "ownerType" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetafieldDefinition_pkey" PRIMARY KEY ("id")
);
