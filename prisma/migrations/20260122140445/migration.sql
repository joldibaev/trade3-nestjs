-- CreateTable
CREATE TABLE "InventoryReprocessing" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,
    "documentPurchaseId" TEXT,
    "documentSaleId" TEXT,
    "documentReturnId" TEXT,
    "documentAdjustmentId" TEXT,
    "documentTransferId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryReprocessing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryReprocessingItem" (
    "id" TEXT NOT NULL,
    "reprocessingId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "oldAveragePurchasePrice" DECIMAL(12,2) NOT NULL,
    "newAveragePurchasePrice" DECIMAL(12,2) NOT NULL,
    "oldQuantity" DECIMAL(12,3) NOT NULL,
    "newQuantity" DECIMAL(12,3) NOT NULL,
    "affectedLedgerCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryReprocessingItem_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "InventoryReprocessing" ADD CONSTRAINT "InventoryReprocessing_documentPurchaseId_fkey" FOREIGN KEY ("documentPurchaseId") REFERENCES "DocumentPurchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReprocessing" ADD CONSTRAINT "InventoryReprocessing_documentSaleId_fkey" FOREIGN KEY ("documentSaleId") REFERENCES "DocumentSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReprocessing" ADD CONSTRAINT "InventoryReprocessing_documentReturnId_fkey" FOREIGN KEY ("documentReturnId") REFERENCES "DocumentReturn"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReprocessing" ADD CONSTRAINT "InventoryReprocessing_documentAdjustmentId_fkey" FOREIGN KEY ("documentAdjustmentId") REFERENCES "DocumentAdjustment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReprocessing" ADD CONSTRAINT "InventoryReprocessing_documentTransferId_fkey" FOREIGN KEY ("documentTransferId") REFERENCES "DocumentTransfer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReprocessingItem" ADD CONSTRAINT "InventoryReprocessingItem_reprocessingId_fkey" FOREIGN KEY ("reprocessingId") REFERENCES "InventoryReprocessing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReprocessingItem" ADD CONSTRAINT "InventoryReprocessingItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReprocessingItem" ADD CONSTRAINT "InventoryReprocessingItem_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
