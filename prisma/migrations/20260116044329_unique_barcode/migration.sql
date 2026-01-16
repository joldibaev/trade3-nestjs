/*
  Warnings:

  - A unique constraint covering the columns `[value]` on the table `Barcode` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Barcode_productId_value_key";

-- CreateIndex
CREATE UNIQUE INDEX "Barcode_value_key" ON "Barcode"("value");
