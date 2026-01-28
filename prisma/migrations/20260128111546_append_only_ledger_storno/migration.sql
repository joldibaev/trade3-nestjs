/*
  Warnings:

  - You are about to drop the `InventoryReprocessing` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `InventoryReprocessingItem` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "LedgerReason" AS ENUM ('INITIAL', 'REVERSAL', 'CORRECTION');

-- DropForeignKey
ALTER TABLE "InventoryReprocessing" DROP CONSTRAINT "InventoryReprocessing_documentAdjustmentId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryReprocessing" DROP CONSTRAINT "InventoryReprocessing_documentPurchaseId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryReprocessing" DROP CONSTRAINT "InventoryReprocessing_documentReturnId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryReprocessing" DROP CONSTRAINT "InventoryReprocessing_documentSaleId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryReprocessing" DROP CONSTRAINT "InventoryReprocessing_documentTransferId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryReprocessingItem" DROP CONSTRAINT "InventoryReprocessingItem_productId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryReprocessingItem" DROP CONSTRAINT "InventoryReprocessingItem_reprocessingId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryReprocessingItem" DROP CONSTRAINT "InventoryReprocessingItem_storeId_fkey";

-- AlterTable
ALTER TABLE "StockLedger" ADD COLUMN     "causationId" TEXT,
ADD COLUMN     "parentLedgerId" TEXT,
ADD COLUMN     "reason" "LedgerReason" NOT NULL DEFAULT 'INITIAL';

-- DropTable
DROP TABLE "InventoryReprocessing";

-- DropTable
DROP TABLE "InventoryReprocessingItem";

-- AddForeignKey
ALTER TABLE "StockLedger" ADD CONSTRAINT "StockLedger_parentLedgerId_fkey" FOREIGN KEY ("parentLedgerId") REFERENCES "StockLedger"("id") ON DELETE SET NULL ON UPDATE CASCADE;
