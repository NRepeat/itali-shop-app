/*
  Warnings:

  - You are about to drop the column `owner` on the `MetafieldDefinition` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[key]` on the table `MetafieldDefinition` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "MetafieldDefinition" DROP COLUMN "owner";

-- CreateIndex
CREATE UNIQUE INDEX "MetafieldDefinition_key_key" ON "MetafieldDefinition"("key");
