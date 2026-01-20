-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "batchId" TEXT,
ADD COLUMN     "quantityBefore" DECIMAL(12,3) NOT NULL DEFAULT 0,
ADD COLUMN     "transactionAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "userId" TEXT;

-- CreateIndex
CREATE INDEX "StockMovement_batchId_idx" ON "StockMovement"("batchId");

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
