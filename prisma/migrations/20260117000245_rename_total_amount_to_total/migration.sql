/*
  Warnings:

  - You are about to drop the column `totalAmount` on the `DocumentReturn` table. All the data in the column will be lost.
  - You are about to drop the column `totalAmount` on the `DocumentSale` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "DocumentReturn" DROP COLUMN "totalAmount",
ADD COLUMN     "total" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "DocumentSale" DROP COLUMN "totalAmount",
ADD COLUMN     "total" DECIMAL(12,2) NOT NULL DEFAULT 0;
