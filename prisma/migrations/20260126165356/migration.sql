/*
  Warnings:

  - You are about to drop the `DocumentLedger` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "DocumentLedger" DROP CONSTRAINT "DocumentLedger_documentAdjustmentId_fkey";

-- DropForeignKey
ALTER TABLE "DocumentLedger" DROP CONSTRAINT "DocumentLedger_documentPriceChangeId_fkey";

-- DropForeignKey
ALTER TABLE "DocumentLedger" DROP CONSTRAINT "DocumentLedger_documentPurchaseId_fkey";

-- DropForeignKey
ALTER TABLE "DocumentLedger" DROP CONSTRAINT "DocumentLedger_documentReturnId_fkey";

-- DropForeignKey
ALTER TABLE "DocumentLedger" DROP CONSTRAINT "DocumentLedger_documentSaleId_fkey";

-- DropForeignKey
ALTER TABLE "DocumentLedger" DROP CONSTRAINT "DocumentLedger_documentTransferId_fkey";

-- DropTable
DROP TABLE "DocumentLedger";

-- CreateTable
CREATE TABLE "DocumentHistory" (
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

    CONSTRAINT "DocumentHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentHistory_documentPurchaseId_idx" ON "DocumentHistory"("documentPurchaseId");

-- CreateIndex
CREATE INDEX "DocumentHistory_documentSaleId_idx" ON "DocumentHistory"("documentSaleId");

-- CreateIndex
CREATE INDEX "DocumentHistory_documentReturnId_idx" ON "DocumentHistory"("documentReturnId");

-- CreateIndex
CREATE INDEX "DocumentHistory_documentAdjustmentId_idx" ON "DocumentHistory"("documentAdjustmentId");

-- CreateIndex
CREATE INDEX "DocumentHistory_documentTransferId_idx" ON "DocumentHistory"("documentTransferId");

-- CreateIndex
CREATE INDEX "DocumentHistory_documentPriceChangeId_idx" ON "DocumentHistory"("documentPriceChangeId");

-- AddForeignKey
ALTER TABLE "DocumentHistory" ADD CONSTRAINT "DocumentHistory_documentPurchaseId_fkey" FOREIGN KEY ("documentPurchaseId") REFERENCES "DocumentPurchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentHistory" ADD CONSTRAINT "DocumentHistory_documentSaleId_fkey" FOREIGN KEY ("documentSaleId") REFERENCES "DocumentSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentHistory" ADD CONSTRAINT "DocumentHistory_documentReturnId_fkey" FOREIGN KEY ("documentReturnId") REFERENCES "DocumentReturn"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentHistory" ADD CONSTRAINT "DocumentHistory_documentAdjustmentId_fkey" FOREIGN KEY ("documentAdjustmentId") REFERENCES "DocumentAdjustment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentHistory" ADD CONSTRAINT "DocumentHistory_documentTransferId_fkey" FOREIGN KEY ("documentTransferId") REFERENCES "DocumentTransfer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentHistory" ADD CONSTRAINT "DocumentHistory_documentPriceChangeId_fkey" FOREIGN KEY ("documentPriceChangeId") REFERENCES "DocumentPriceChange"("id") ON DELETE SET NULL ON UPDATE CASCADE;
