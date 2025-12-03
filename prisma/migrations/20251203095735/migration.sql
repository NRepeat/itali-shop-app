/*
  Warnings:

  - A unique constraint covering the columns `[metafieldId]` on the table `MetafieldDefinition` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `metafieldId` to the `MetafieldDefinition` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "MetafieldDefinition" ADD COLUMN     "metafieldId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "MetafieldDefinition_metafieldId_key" ON "MetafieldDefinition"("metafieldId");
