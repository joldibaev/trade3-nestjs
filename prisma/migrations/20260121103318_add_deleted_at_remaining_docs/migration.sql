-- AlterTable
ALTER TABLE "DocumentAdjustment" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "DocumentReturn" ADD COLUMN     "deletedAt" TIMESTAMP(3);
