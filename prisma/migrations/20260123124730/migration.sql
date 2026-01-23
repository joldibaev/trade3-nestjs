/*
  Warnings:

  - A unique constraint covering the columns `[code]` on the table `Product` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `code` to the `Product` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "DocumentAdjustment" ALTER COLUMN "code" DROP DEFAULT,
ALTER COLUMN "code" SET DATA TYPE TEXT;
DROP SEQUENCE "DocumentAdjustment_code_seq";

-- AlterTable
ALTER TABLE "DocumentPriceChange" ALTER COLUMN "code" DROP DEFAULT,
ALTER COLUMN "code" SET DATA TYPE TEXT;
DROP SEQUENCE "DocumentPriceChange_code_seq";

-- AlterTable
ALTER TABLE "DocumentPurchase" ALTER COLUMN "code" DROP DEFAULT,
ALTER COLUMN "code" SET DATA TYPE TEXT;
DROP SEQUENCE "DocumentPurchase_code_seq";

-- AlterTable
ALTER TABLE "DocumentReturn" ALTER COLUMN "code" DROP DEFAULT,
ALTER COLUMN "code" SET DATA TYPE TEXT;
DROP SEQUENCE "DocumentReturn_code_seq";

-- AlterTable
ALTER TABLE "DocumentSale" ALTER COLUMN "code" DROP DEFAULT,
ALTER COLUMN "code" SET DATA TYPE TEXT;
DROP SEQUENCE "DocumentSale_code_seq";

-- AlterTable
ALTER TABLE "DocumentTransfer" ALTER COLUMN "code" DROP DEFAULT,
ALTER COLUMN "code" SET DATA TYPE TEXT;
DROP SEQUENCE "DocumentTransfer_code_seq";

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "code" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Product_code_key" ON "Product"("code");
