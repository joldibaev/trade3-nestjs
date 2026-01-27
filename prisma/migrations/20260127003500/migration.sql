-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('DRAFT', 'COMPLETED', 'CANCELLED', 'SCHEDULED');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MANAGER', 'CASHIER', 'USER');

-- CreateEnum
CREATE TYPE "BarcodeType" AS ENUM ('EAN13', 'EAN8', 'CODE128', 'INTERNAL', 'OTHER');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('PURCHASE', 'SALE', 'RETURN', 'ADJUSTMENT', 'TRANSFER_IN', 'TRANSFER_OUT');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "refreshTokenHash" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Store" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "workingHours" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cashbox" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cashbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceLedger" (
    "id" TEXT NOT NULL,
    "valueBefore" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "value" DECIMAL(12,2) NOT NULL,
    "productId" TEXT NOT NULL,
    "priceTypeId" TEXT NOT NULL,
    "documentPriceChangeId" TEXT,
    "batchId" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Price" (
    "id" TEXT NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,
    "productId" TEXT NOT NULL,
    "priceTypeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Price_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stock" (
    "id" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "averagePurchasePrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "productId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "article" TEXT,
    "categoryId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Barcode" (
    "id" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "type" "BarcodeType" NOT NULL DEFAULT 'EAN13',
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Barcode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentSale" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "storeId" TEXT NOT NULL,
    "cashboxId" TEXT,
    "clientId" TEXT,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "priceTypeId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "authorId" TEXT,

    CONSTRAINT "DocumentSale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentSaleItem" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "costPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentSaleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentPurchase" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vendorId" TEXT,
    "storeId" TEXT NOT NULL,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "authorId" TEXT,

    CONSTRAINT "DocumentPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentPurchaseItem" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentPurchaseItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentReturn" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "storeId" TEXT NOT NULL,
    "clientId" TEXT,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "authorId" TEXT,

    CONSTRAINT "DocumentReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentReturnItem" (
    "id" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentReturnItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentAdjustment" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "storeId" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "authorId" TEXT,

    CONSTRAINT "DocumentAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentAdjustmentItem" (
    "id" TEXT NOT NULL,
    "adjustmentId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "quantityBefore" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "quantityAfter" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentAdjustmentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentTransfer" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceStoreId" TEXT NOT NULL,
    "destinationStoreId" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "authorId" TEXT,

    CONSTRAINT "DocumentTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentTransferItem" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentTransferItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentPriceChange" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "documentPurchaseId" TEXT,
    "authorId" TEXT,

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

-- CreateTable
CREATE TABLE "DocumentHistory" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" JSONB,
    "documentPurchaseId" TEXT,
    "documentSaleId" TEXT,
    "documentReturnId" TEXT,
    "documentAdjustmentId" TEXT,
    "documentTransferId" TEXT,
    "documentPriceChangeId" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "authorId" TEXT,

    CONSTRAINT "DocumentHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Store_name_key" ON "Store"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Cashbox_name_storeId_key" ON "Cashbox"("name", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "PriceType_name_key" ON "PriceType"("name");

-- CreateIndex
CREATE INDEX "PriceLedger_productId_priceTypeId_date_idx" ON "PriceLedger"("productId", "priceTypeId", "date" DESC);

-- CreateIndex
CREATE INDEX "PriceLedger_batchId_idx" ON "PriceLedger"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "Price_productId_priceTypeId_key" ON "Price"("productId", "priceTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Stock_productId_storeId_key" ON "Stock"("productId", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_code_key" ON "Product"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Product_categoryId_name_key" ON "Product"("categoryId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Barcode_value_key" ON "Barcode"("value");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_name_key" ON "Vendor"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Client_name_key" ON "Client"("name");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentSale_code_key" ON "DocumentSale"("code");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentPurchase_code_key" ON "DocumentPurchase"("code");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentReturn_code_key" ON "DocumentReturn"("code");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentAdjustment_code_key" ON "DocumentAdjustment"("code");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentTransfer_code_key" ON "DocumentTransfer"("code");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentPriceChange_code_key" ON "DocumentPriceChange"("code");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentPriceChange_documentPurchaseId_key" ON "DocumentPriceChange"("documentPurchaseId");

-- CreateIndex
CREATE INDEX "StockLedger_storeId_productId_date_idx" ON "StockLedger"("storeId", "productId", "date" DESC);

-- CreateIndex
CREATE INDEX "StockLedger_productId_date_idx" ON "StockLedger"("productId", "date" DESC);

-- CreateIndex
CREATE INDEX "StockLedger_batchId_idx" ON "StockLedger"("batchId");

-- CreateIndex
CREATE INDEX "StockLedger_date_idx" ON "StockLedger"("date");

-- CreateIndex
CREATE INDEX "DocumentHistory_documentPurchaseId_idx" ON "DocumentHistory"("documentPurchaseId");

-- CreateIndex
CREATE INDEX "DocumentHistory_documentSaleId_idx" ON "DocumentHistory"("documentSaleId");

-- CreateIndex
CREATE INDEX "DocumentHistory_documentReturnId_idx" ON "DocumentHistory"("documentReturnId");

-- CreateIndex
CREATE INDEX "DocumentHistory_documentAdjustmentId_idx" ON "DocumentHistory"("documentAdjustmentId");

-- CreateIndex
CREATE INDEX "DocumentHistory_documentTransferId_idx" ON "DocumentHistory"("documentTransferId");

-- CreateIndex
CREATE INDEX "DocumentHistory_documentPriceChangeId_idx" ON "DocumentHistory"("documentPriceChangeId");

-- AddForeignKey
ALTER TABLE "Cashbox" ADD CONSTRAINT "Cashbox_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceLedger" ADD CONSTRAINT "PriceLedger_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceLedger" ADD CONSTRAINT "PriceLedger_priceTypeId_fkey" FOREIGN KEY ("priceTypeId") REFERENCES "PriceType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceLedger" ADD CONSTRAINT "PriceLedger_documentPriceChangeId_fkey" FOREIGN KEY ("documentPriceChangeId") REFERENCES "DocumentPriceChange"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Price" ADD CONSTRAINT "Price_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Price" ADD CONSTRAINT "Price_priceTypeId_fkey" FOREIGN KEY ("priceTypeId") REFERENCES "PriceType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stock" ADD CONSTRAINT "Stock_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stock" ADD CONSTRAINT "Stock_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Barcode" ADD CONSTRAINT "Barcode_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSale" ADD CONSTRAINT "DocumentSale_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSale" ADD CONSTRAINT "DocumentSale_cashboxId_fkey" FOREIGN KEY ("cashboxId") REFERENCES "Cashbox"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSale" ADD CONSTRAINT "DocumentSale_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSale" ADD CONSTRAINT "DocumentSale_priceTypeId_fkey" FOREIGN KEY ("priceTypeId") REFERENCES "PriceType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSale" ADD CONSTRAINT "DocumentSale_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSaleItem" ADD CONSTRAINT "DocumentSaleItem_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "DocumentSale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSaleItem" ADD CONSTRAINT "DocumentSaleItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentPurchase" ADD CONSTRAINT "DocumentPurchase_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentPurchase" ADD CONSTRAINT "DocumentPurchase_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentPurchase" ADD CONSTRAINT "DocumentPurchase_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentPurchaseItem" ADD CONSTRAINT "DocumentPurchaseItem_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "DocumentPurchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentPurchaseItem" ADD CONSTRAINT "DocumentPurchaseItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentReturn" ADD CONSTRAINT "DocumentReturn_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentReturn" ADD CONSTRAINT "DocumentReturn_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentReturn" ADD CONSTRAINT "DocumentReturn_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentReturnItem" ADD CONSTRAINT "DocumentReturnItem_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "DocumentReturn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentReturnItem" ADD CONSTRAINT "DocumentReturnItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAdjustment" ADD CONSTRAINT "DocumentAdjustment_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAdjustment" ADD CONSTRAINT "DocumentAdjustment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAdjustmentItem" ADD CONSTRAINT "DocumentAdjustmentItem_adjustmentId_fkey" FOREIGN KEY ("adjustmentId") REFERENCES "DocumentAdjustment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAdjustmentItem" ADD CONSTRAINT "DocumentAdjustmentItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentTransfer" ADD CONSTRAINT "DocumentTransfer_sourceStoreId_fkey" FOREIGN KEY ("sourceStoreId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentTransfer" ADD CONSTRAINT "DocumentTransfer_destinationStoreId_fkey" FOREIGN KEY ("destinationStoreId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentTransfer" ADD CONSTRAINT "DocumentTransfer_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentTransferItem" ADD CONSTRAINT "DocumentTransferItem_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "DocumentTransfer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentTransferItem" ADD CONSTRAINT "DocumentTransferItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentPriceChange" ADD CONSTRAINT "DocumentPriceChange_documentPurchaseId_fkey" FOREIGN KEY ("documentPurchaseId") REFERENCES "DocumentPurchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentPriceChange" ADD CONSTRAINT "DocumentPriceChange_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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

-- AddForeignKey
ALTER TABLE "DocumentHistory" ADD CONSTRAINT "DocumentHistory_documentPurchaseId_fkey" FOREIGN KEY ("documentPurchaseId") REFERENCES "DocumentPurchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentHistory" ADD CONSTRAINT "DocumentHistory_documentSaleId_fkey" FOREIGN KEY ("documentSaleId") REFERENCES "DocumentSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentHistory" ADD CONSTRAINT "DocumentHistory_documentReturnId_fkey" FOREIGN KEY ("documentReturnId") REFERENCES "DocumentReturn"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentHistory" ADD CONSTRAINT "DocumentHistory_documentAdjustmentId_fkey" FOREIGN KEY ("documentAdjustmentId") REFERENCES "DocumentAdjustment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentHistory" ADD CONSTRAINT "DocumentHistory_documentTransferId_fkey" FOREIGN KEY ("documentTransferId") REFERENCES "DocumentTransfer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentHistory" ADD CONSTRAINT "DocumentHistory_documentPriceChangeId_fkey" FOREIGN KEY ("documentPriceChangeId") REFERENCES "DocumentPriceChange"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentHistory" ADD CONSTRAINT "DocumentHistory_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
