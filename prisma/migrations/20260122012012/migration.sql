/*
  Warnings:

  - You are about to drop the `DocumentPurchaseItemPrice` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PriceHistory` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `StockMovement` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "DocumentPurchaseItemPrice" DROP CONSTRAINT "DocumentPurchaseItemPrice_itemId_fkey";

-- DropForeignKey
ALTER TABLE "DocumentPurchaseItemPrice" DROP CONSTRAINT "DocumentPurchaseItemPrice_priceTypeId_fkey";

-- DropForeignKey
ALTER TABLE "PriceHistory" DROP CONSTRAINT "PriceHistory_documentPurchaseId_fkey";

-- DropForeignKey
ALTER TABLE "PriceHistory" DROP CONSTRAINT "PriceHistory_priceTypeId_fkey";

-- DropForeignKey
ALTER TABLE "PriceHistory" DROP CONSTRAINT "PriceHistory_productId_fkey";

-- DropForeignKey
ALTER TABLE "StockMovement" DROP CONSTRAINT "StockMovement_documentAdjustmentId_fkey";

-- DropForeignKey
ALTER TABLE "StockMovement" DROP CONSTRAINT "StockMovement_documentPurchaseId_fkey";

-- DropForeignKey
ALTER TABLE "StockMovement" DROP CONSTRAINT "StockMovement_documentReturnId_fkey";

-- DropForeignKey
ALTER TABLE "StockMovement" DROP CONSTRAINT "StockMovement_documentSaleId_fkey";

-- DropForeignKey
ALTER TABLE "StockMovement" DROP CONSTRAINT "StockMovement_documentTransferId_fkey";

-- DropForeignKey
ALTER TABLE "StockMovement" DROP CONSTRAINT "StockMovement_productId_fkey";

-- DropForeignKey
ALTER TABLE "StockMovement" DROP CONSTRAINT "StockMovement_storeId_fkey";

-- DropForeignKey
ALTER TABLE "StockMovement" DROP CONSTRAINT "StockMovement_userId_fkey";

-- AlterTable
ALTER TABLE "DocumentHistory" ADD COLUMN     "documentPriceChangeId" TEXT;

-- DropTable
DROP TABLE "DocumentPurchaseItemPrice";

-- DropTable
DROP TABLE "PriceHistory";

-- DropTable
DROP TABLE "StockMovement";

-- CreateTable
CREATE TABLE "PriceLedger" (
    "id" TEXT NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,
    "productId" TEXT NOT NULL,
    "priceTypeId" TEXT NOT NULL,
    "documentPriceChangeId" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentPriceChange" (
    "id" TEXT NOT NULL,
    "code" SERIAL NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "storeId" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentPriceChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentPriceChangeItem" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "priceTypeId" TEXT NOT NULL,
    "oldValue" DECIMAL(12,2) NOT NULL,
    "newValue" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentPriceChangeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockLedger" (
    "id" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantityBefore" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "quantity" DECIMAL(12,3) NOT NULL,
    "quantityAfter" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "averagePurchasePrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "transactionAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "batchId" TEXT,
    "userId" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "documentPurchaseId" TEXT,
    "documentSaleId" TEXT,
    "documentReturnId" TEXT,
    "documentAdjustmentId" TEXT,
    "documentTransferId" TEXT,

    CONSTRAINT "StockLedger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PriceLedger_productId_priceTypeId_date_idx" ON "PriceLedger"("productId", "priceTypeId", "date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentPriceChange_code_key" ON "DocumentPriceChange"("code");

-- CreateIndex
CREATE INDEX "StockLedger_storeId_productId_idx" ON "StockLedger"("storeId", "productId");

-- CreateIndex
CREATE INDEX "StockLedger_batchId_idx" ON "StockLedger"("batchId");

-- CreateIndex
CREATE INDEX "StockLedger_date_idx" ON "StockLedger"("date");

-- CreateIndex
CREATE INDEX "DocumentHistory_documentPriceChangeId_idx" ON "DocumentHistory"("documentPriceChangeId");

-- AddForeignKey
ALTER TABLE "PriceLedger" ADD CONSTRAINT "PriceLedger_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceLedger" ADD CONSTRAINT "PriceLedger_priceTypeId_fkey" FOREIGN KEY ("priceTypeId") REFERENCES "PriceType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceLedger" ADD CONSTRAINT "PriceLedger_documentPriceChangeId_fkey" FOREIGN KEY ("documentPriceChangeId") REFERENCES "DocumentPriceChange"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentPriceChange" ADD CONSTRAINT "DocumentPriceChange_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentPriceChangeItem" ADD CONSTRAINT "DocumentPriceChangeItem_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "DocumentPriceChange"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentPriceChangeItem" ADD CONSTRAINT "DocumentPriceChangeItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentPriceChangeItem" ADD CONSTRAINT "DocumentPriceChangeItem_priceTypeId_fkey" FOREIGN KEY ("priceTypeId") REFERENCES "PriceType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLedger" ADD CONSTRAINT "StockLedger_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLedger" ADD CONSTRAINT "StockLedger_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLedger" ADD CONSTRAINT "StockLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLedger" ADD CONSTRAINT "StockLedger_documentPurchaseId_fkey" FOREIGN KEY ("documentPurchaseId") REFERENCES "DocumentPurchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLedger" ADD CONSTRAINT "StockLedger_documentSaleId_fkey" FOREIGN KEY ("documentSaleId") REFERENCES "DocumentSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLedger" ADD CONSTRAINT "StockLedger_documentReturnId_fkey" FOREIGN KEY ("documentReturnId") REFERENCES "DocumentReturn"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLedger" ADD CONSTRAINT "StockLedger_documentAdjustmentId_fkey" FOREIGN KEY ("documentAdjustmentId") REFERENCES "DocumentAdjustment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLedger" ADD CONSTRAINT "StockLedger_documentTransferId_fkey" FOREIGN KEY ("documentTransferId") REFERENCES "DocumentTransfer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentHistory" ADD CONSTRAINT "DocumentHistory_documentPriceChangeId_fkey" FOREIGN KEY ("documentPriceChangeId") REFERENCES "DocumentPriceChange"("id") ON DELETE SET NULL ON UPDATE CASCADE;
