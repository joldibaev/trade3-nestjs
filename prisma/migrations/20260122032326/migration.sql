/*
  Warnings:

  - You are about to drop the column `userId` on the `StockLedger` table. All the data in the column will be lost.
  - You are about to drop the `DocumentHistory` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `User` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[documentPurchaseId]` on the table `DocumentPriceChange` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "DocumentHistory" DROP CONSTRAINT "DocumentHistory_documentAdjustmentId_fkey";

-- DropForeignKey
ALTER TABLE "DocumentHistory" DROP CONSTRAINT "DocumentHistory_documentPriceChangeId_fkey";

-- DropForeignKey
ALTER TABLE "DocumentHistory" DROP CONSTRAINT "DocumentHistory_documentPurchaseId_fkey";

-- DropForeignKey
ALTER TABLE "DocumentHistory" DROP CONSTRAINT "DocumentHistory_documentReturnId_fkey";

-- DropForeignKey
ALTER TABLE "DocumentHistory" DROP CONSTRAINT "DocumentHistory_documentSaleId_fkey";

-- DropForeignKey
ALTER TABLE "DocumentHistory" DROP CONSTRAINT "DocumentHistory_documentTransferId_fkey";

-- DropForeignKey
ALTER TABLE "StockLedger" DROP CONSTRAINT "StockLedger_userId_fkey";

-- AlterTable
ALTER TABLE "DocumentPriceChange" ADD COLUMN     "documentPurchaseId" TEXT;

-- AlterTable
ALTER TABLE "StockLedger" DROP COLUMN "userId";

-- DropTable
DROP TABLE "DocumentHistory";

-- DropTable
DROP TABLE "User";

-- CreateTable
CREATE TABLE "DocumentLedger" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" JSONB,
    "documentPurchaseId" TEXT,
    "documentSaleId" TEXT,
    "documentReturnId" TEXT,
    "documentAdjustmentId" TEXT,
    "documentTransferId" TEXT,
    "documentPriceChangeId" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentLedger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentLedger_documentPurchaseId_idx" ON "DocumentLedger"("documentPurchaseId");

-- CreateIndex
CREATE INDEX "DocumentLedger_documentSaleId_idx" ON "DocumentLedger"("documentSaleId");

-- CreateIndex
CREATE INDEX "DocumentLedger_documentReturnId_idx" ON "DocumentLedger"("documentReturnId");

-- CreateIndex
CREATE INDEX "DocumentLedger_documentAdjustmentId_idx" ON "DocumentLedger"("documentAdjustmentId");

-- CreateIndex
CREATE INDEX "DocumentLedger_documentTransferId_idx" ON "DocumentLedger"("documentTransferId");

-- CreateIndex
CREATE INDEX "DocumentLedger_documentPriceChangeId_idx" ON "DocumentLedger"("documentPriceChangeId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentPriceChange_documentPurchaseId_key" ON "DocumentPriceChange"("documentPurchaseId");

-- AddForeignKey
ALTER TABLE "DocumentPriceChange" ADD CONSTRAINT "DocumentPriceChange_documentPurchaseId_fkey" FOREIGN KEY ("documentPurchaseId") REFERENCES "DocumentPurchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentLedger" ADD CONSTRAINT "DocumentLedger_documentPurchaseId_fkey" FOREIGN KEY ("documentPurchaseId") REFERENCES "DocumentPurchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentLedger" ADD CONSTRAINT "DocumentLedger_documentSaleId_fkey" FOREIGN KEY ("documentSaleId") REFERENCES "DocumentSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentLedger" ADD CONSTRAINT "DocumentLedger_documentReturnId_fkey" FOREIGN KEY ("documentReturnId") REFERENCES "DocumentReturn"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentLedger" ADD CONSTRAINT "DocumentLedger_documentAdjustmentId_fkey" FOREIGN KEY ("documentAdjustmentId") REFERENCES "DocumentAdjustment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentLedger" ADD CONSTRAINT "DocumentLedger_documentTransferId_fkey" FOREIGN KEY ("documentTransferId") REFERENCES "DocumentTransfer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentLedger" ADD CONSTRAINT "DocumentLedger_documentPriceChangeId_fkey" FOREIGN KEY ("documentPriceChangeId") REFERENCES "DocumentPriceChange"("id") ON DELETE SET NULL ON UPDATE CASCADE;
