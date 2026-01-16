/*
  Warnings:

  - You are about to alter the column `quantity` on the `DocumentAdjustmentItem` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(12,3)`.
  - You are about to alter the column `quantityBefore` on the `DocumentAdjustmentItem` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(12,3)`.
  - You are about to alter the column `quantityAfter` on the `DocumentAdjustmentItem` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(12,3)`.
  - You are about to alter the column `totalAmount` on the `DocumentPurchase` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(12,2)`.
  - You are about to alter the column `quantity` on the `DocumentPurchaseItem` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(12,3)`.
  - You are about to alter the column `price` on the `DocumentPurchaseItem` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(12,2)`.
  - You are about to alter the column `total` on the `DocumentPurchaseItem` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(12,2)`.
  - You are about to alter the column `value` on the `DocumentPurchaseItemPrice` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(12,2)`.
  - You are about to alter the column `totalAmount` on the `DocumentReturn` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(12,2)`.
  - You are about to alter the column `quantity` on the `DocumentReturnItem` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(12,3)`.
  - You are about to alter the column `price` on the `DocumentReturnItem` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(12,2)`.
  - You are about to alter the column `total` on the `DocumentReturnItem` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(12,2)`.
  - You are about to alter the column `totalAmount` on the `DocumentSale` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(12,2)`.
  - You are about to alter the column `quantity` on the `DocumentSaleItem` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(12,3)`.
  - You are about to alter the column `price` on the `DocumentSaleItem` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(12,2)`.
  - You are about to alter the column `costPrice` on the `DocumentSaleItem` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(12,2)`.
  - You are about to alter the column `total` on the `DocumentSaleItem` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(12,2)`.
  - You are about to alter the column `quantity` on the `DocumentTransferItem` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(12,3)`.
  - You are about to alter the column `value` on the `Price` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(12,2)`.
  - You are about to alter the column `value` on the `PriceHistory` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(12,2)`.
  - You are about to alter the column `quantity` on the `Stock` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(12,3)`.
  - You are about to alter the column `averagePurchasePrice` on the `Stock` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(12,2)`.
  - You are about to alter the column `quantity` on the `StockMovement` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(12,3)`.
  - You are about to alter the column `quantityAfter` on the `StockMovement` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(12,3)`.
  - You are about to alter the column `averagePurchasePrice` on the `StockMovement` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(12,2)`.

*/
-- AlterTable
ALTER TABLE "DocumentAdjustmentItem" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(12,3),
ALTER COLUMN "quantityBefore" SET DATA TYPE DECIMAL(12,3),
ALTER COLUMN "quantityAfter" SET DATA TYPE DECIMAL(12,3);

-- AlterTable
ALTER TABLE "DocumentPurchase" ALTER COLUMN "totalAmount" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "DocumentPurchaseItem" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(12,3),
ALTER COLUMN "price" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "total" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "DocumentPurchaseItemPrice" ALTER COLUMN "value" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "DocumentReturn" ALTER COLUMN "totalAmount" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "DocumentReturnItem" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(12,3),
ALTER COLUMN "price" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "total" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "DocumentSale" ALTER COLUMN "totalAmount" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "DocumentSaleItem" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(12,3),
ALTER COLUMN "price" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "costPrice" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "total" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "DocumentTransferItem" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(12,3);

-- AlterTable
ALTER TABLE "Price" ALTER COLUMN "value" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "PriceHistory" ALTER COLUMN "value" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "Stock" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(12,3),
ALTER COLUMN "averagePurchasePrice" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "StockMovement" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(12,3),
ALTER COLUMN "quantityAfter" SET DATA TYPE DECIMAL(12,3),
ALTER COLUMN "averagePurchasePrice" SET DATA TYPE DECIMAL(12,2);
