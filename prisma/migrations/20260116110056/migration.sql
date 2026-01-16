/*
  Warnings:

  - You are about to drop the column `totalAmount` on the `DocumentPurchase` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "DocumentPurchase" DROP COLUMN "totalAmount",
ADD COLUMN     "total" DECIMAL(12,2) NOT NULL DEFAULT 0;
