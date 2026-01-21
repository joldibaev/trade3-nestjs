-- DropIndex
DROP INDEX "PriceHistory_productId_priceTypeId_idx";

-- AlterTable
ALTER TABLE "PriceHistory" ADD COLUMN     "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "PriceHistory_productId_priceTypeId_date_idx" ON "PriceHistory"("productId", "priceTypeId", "date" DESC);
