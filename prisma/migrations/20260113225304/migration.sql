/*
  Warnings:

  - A unique constraint covering the columns `[code]` on the table `DocumentAdjustment` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[code]` on the table `DocumentPurchase` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[code]` on the table `DocumentReturn` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[code]` on the table `DocumentSale` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[code]` on the table `DocumentTransfer` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "DocumentAdjustment" ADD COLUMN     "code" SERIAL NOT NULL;

-- AlterTable
ALTER TABLE "DocumentPurchase" ADD COLUMN     "code" SERIAL NOT NULL;

-- AlterTable
ALTER TABLE "DocumentReturn" ADD COLUMN     "code" SERIAL NOT NULL;

-- AlterTable
ALTER TABLE "DocumentSale" ADD COLUMN     "code" SERIAL NOT NULL;

-- AlterTable
ALTER TABLE "DocumentTransfer" ADD COLUMN     "code" SERIAL NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "DocumentAdjustment_code_key" ON "DocumentAdjustment"("code");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentPurchase_code_key" ON "DocumentPurchase"("code");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentReturn_code_key" ON "DocumentReturn"("code");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentSale_code_key" ON "DocumentSale"("code");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentTransfer_code_key" ON "DocumentTransfer"("code");
