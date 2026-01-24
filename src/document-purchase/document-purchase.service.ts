import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import { InventoryService } from '../core/inventory/inventory.service';
import { Prisma } from '../generated/prisma/client';
import {
  CreateDocumentPurchaseDto,
  UpdateProductPriceDto,
} from './dto/create-document-purchase.dto';
import { UpdateDocumentPurchaseDto } from './dto/update-document-purchase.dto';
import { StoreService } from '../store/store.service';
import { StockLedgerService } from '../stock-ledger/stock-ledger.service';
import { DocumentLedgerService } from '../document-ledger/document-ledger.service';
import { BaseDocumentService } from '../common/base-document.service';
import { CodeGeneratorService } from '../core/code-generator/code-generator.service';
import { DocumentStatus } from '../generated/prisma/enums';
import Decimal = Prisma.Decimal;

interface PreparedPurchaseItem {
  productId: string;
  quantity: Decimal;
  price: Decimal;
  total: Decimal;
  newPrices?: UpdateProductPriceDto[];
}

interface PurchaseContext {
  id?: string;
  storeId: string;
  date?: Date;
}

@Injectable()
export class DocumentPurchaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly storeService: StoreService,
    private readonly stockLedgerService: StockLedgerService,
    private readonly ledgerService: DocumentLedgerService,
    private readonly baseService: BaseDocumentService,
    private readonly codeGenerator: CodeGeneratorService,
  ) {}

  async create(createDocumentPurchaseDto: CreateDocumentPurchaseDto) {
    const { storeId, vendorId, date, items, status, notes } = createDocumentPurchaseDto;

    let targetStatus = status || 'DRAFT';
    const safeItems = items || [];

    // 0. Validate Date
    const docDate = new Date(date);

    // Auto-schedule if date is in the future
    if (targetStatus === 'COMPLETED' && docDate > new Date()) {
      // We need to cast or ensure the type system knows about SCHEDULED if it wasn't there before,
      // but since we updated prisma, it should be fine.
      // However, CreateDocumentPurchaseDto.status might be strict.
      // Let's assume the DTO allows the enum or string.
      // If DTO is strict, we might need to update DTOs.
      // But typically DTOs use the Enum.
      (targetStatus as any) = 'SCHEDULED';
    }

    // 1. Validate Store
    await this.storeService.validateStore(storeId);

    // 2. Execute Transaction
    const result = await this.prisma.$transaction(
      async (tx) => {
        let preparedItems: PreparedPurchaseItem[] = [];
        let total = new Decimal(0);

        if (safeItems.length > 0) {
          const productIds = safeItems.map((i) => i.productId);
          // Validate products exist
          const productsCount = await tx.product.count({
            where: { id: { in: productIds } },
          });
          if (productsCount !== productIds.length) {
            throw new BadRequestException('Некоторые товары не найдены');
          }

          preparedItems = safeItems.map((item) => {
            const quantity = new Decimal(item.quantity);
            const price = new Decimal(item.price);
            const lineTotal = quantity.mul(price);
            total = total.add(lineTotal);

            return {
              productId: item.productId,
              quantity,
              price,
              total: lineTotal,
              newPrices: item.newPrices,
            };
          });
        }

        // Generate Code
        const code = await this.codeGenerator.getNextPurchaseCode();

        // Create DocumentPurchase
        const doc = await tx.documentPurchase.create({
          data: {
            code,
            storeId,
            vendorId,
            date: docDate,
            status: targetStatus,
            notes,
            total,
            items: {
              create: preparedItems.map((i) => ({
                productId: i.productId,
                quantity: i.quantity,
                price: i.price,
                total: i.total,
              })),
            },
          },
          include: { items: true },
        });

        await this.ledgerService.logAction(tx, {
          documentId: doc.id,
          documentType: 'documentPurchase',
          action: 'CREATED',
          details: { status: targetStatus, total, notes },
        });

        for (const item of preparedItems) {
          await this.ledgerService.logAction(tx, {
            documentId: doc.id,
            documentType: 'documentPurchase',
            action: 'ITEM_ADDED',
            details: {
              productId: item.productId,
              quantity: item.quantity,
              price: item.price,
              total: item.total,
            },
          });
        }

        // --- Handle Automatic DocumentPriceChange ---
        await this.handlePriceChanges(tx, doc.id, doc.code, docDate, preparedItems);
        // ---------------------------------------------

        // 3. Apply Inventory Movements (Only if COMPLETED)
        let reprocessingId: string | null = null;
        if (targetStatus === 'COMPLETED' && preparedItems.length > 0) {
          await this.applyInventoryMovements(tx, doc, preparedItems);

          reprocessingId = await this.inventoryService.triggerReprocessingIfNeeded(tx, {
            storeId,
            productId: preparedItems.map((i) => i.productId),
            date: docDate,
            documentId: doc.id,
            documentType: 'documentPurchase',
          });
        }

        return { doc, reprocessingId };
      },
      {
        isolationLevel: 'Serializable',
      },
    );

    // POST-TRANSACTION: Reprocess History
    if (result.reprocessingId) {
      for (const item of result.doc.items) {
        await this.inventoryService.reprocessProductHistory(
          result.doc.storeId,
          item.productId,
          result.doc.date,
          result.reprocessingId,
        );
      }
      await this.inventoryService.completeReprocessing(result.reprocessingId);
    }

    return result.doc;
  }

  async updateStatus(id: string, newStatus: DocumentStatus) {
    let reprocessingId: string | null = null;
    let productsToReprocess: string[] = [];

    const updatedPurchase = await this.prisma.$transaction(
      async (tx) => {
        const purchase = await tx.documentPurchase.findUniqueOrThrow({
          where: { id },
          include: {
            items: true,
          },
        });

        const oldStatus = purchase.status;
        let actualNewStatus = newStatus;

        // Auto-schedule if date is in the future
        // Note: when Scheduler calls this, date will be <= now, so it will proceed to "COMPLETED".
        if (newStatus === 'COMPLETED' && purchase.date > new Date()) {
          (actualNewStatus as any) = 'SCHEDULED';
        }

        if (oldStatus === actualNewStatus) {
          return purchase;
        }

        // Prevent modifying CANCELLED documents (unless business logic allows revival, but usually not)
        if (oldStatus === 'CANCELLED') {
          throw new BadRequestException('Нельзя изменить статус отмененного документа');
        }

        // Prepare items
        const items = purchase.items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          price: i.price,
          total: i.total,
        }));

        // DRAFT/SCHEDULED -> COMPLETED
        if (
          (oldStatus === 'DRAFT' || oldStatus === 'SCHEDULED') &&
          actualNewStatus === 'COMPLETED'
        ) {
          // 1. Apply Inventory Movements
          await this.applyInventoryMovements(tx, purchase, items);

          // 2. Check if we need reprocessing (Backdated)
          reprocessingId = await this.inventoryService.triggerReprocessingIfNeeded(tx, {
            storeId: purchase.storeId,
            productId: items.map((i) => i.productId),
            date: purchase.date,
            documentId: purchase.id,
            documentType: 'documentPurchase',
          });

          if (reprocessingId) {
            productsToReprocess = items.map((i) => i.productId);
          }
        }

        // COMPLETED -> DRAFT (or CANCELLED or SCHEDULED)
        // Revert the purchase (decrease stock)
        if (
          oldStatus === 'COMPLETED' &&
          (actualNewStatus === 'DRAFT' ||
            actualNewStatus === 'CANCELLED' ||
            actualNewStatus === 'SCHEDULED')
        ) {
          // Check for negative stock before reverting
          await this.validateStockForRevert(tx, purchase.storeId, items);

          // Apply revert (negative quantity)
          const revertItems = items.map((i) => ({
            ...i,
            quantity: i.quantity.negated(),
            total: i.total.negated(),
          }));

          await this.applyInventoryMovements(tx, purchase, revertItems);

          // ALWAYS trigger reprocessing for REVERT because it changes historical state
          const reprocessing = await tx.inventoryReprocessing.create({
            data: {
              status: 'PENDING',
              documentPurchaseId: purchase.id,
              date: purchase.date,
            },
          });
          reprocessingId = reprocessing.id;
          productsToReprocess = items.map((i) => i.productId);
        }

        // Update status
        const updatedDoc = await tx.documentPurchase.update({
          where: { id },
          data: { status: actualNewStatus },
          include: { items: true },
        });

        await this.ledgerService.logAction(tx, {
          documentId: id,
          documentType: 'documentPurchase',
          action: 'STATUS_CHANGED',
          details: { from: oldStatus, to: newStatus },
        });

        return updatedDoc;
      },
      {
        isolationLevel: 'Serializable',
      },
    );

    // POST-TRANSACTION: Reprocess History
    if (reprocessingId && productsToReprocess.length > 0) {
      for (const productId of productsToReprocess) {
        await this.inventoryService.reprocessProductHistory(
          updatedPurchase.storeId,
          productId,
          updatedPurchase.date,
          reprocessingId,
        );
      }
      await this.inventoryService.completeReprocessing(reprocessingId);
    }

    return updatedPurchase;
  }

  private async validateStockForRevert(
    tx: Prisma.TransactionClient,
    storeId: string,
    items: PreparedPurchaseItem[],
  ) {
    const productIds = items.map((i) => i.productId);
    const stocks = await tx.stock.findMany({
      where: { storeId, productId: { in: productIds } },
    });
    const stockMap = new Map(stocks.map((s) => [s.productId, s]));

    for (const item of items) {
      const currentQty = stockMap.get(item.productId)?.quantity || new Decimal(0);
      const currentWap = stockMap.get(item.productId)?.averagePurchasePrice || new Decimal(0);

      // 1. Quantity Check
      if (currentQty.lessThan(item.quantity)) {
        throw new BadRequestException(
          `Недостаточно остатка товара ${item.productId} для отмены закупки`,
        );
      }

      // 2. Financial Check (prevent negative WAP)
      // Current Value = 100 * 55 = 5500
      // Revert Value = 100 * 100 = 10000
      // Result = -4500 (Invalid)
      const currentTotalValue = currentQty.mul(currentWap);
      const revertTotalValue = item.quantity.mul(item.price);

      if (currentTotalValue.lessThan(revertTotalValue)) {
        throw new BadRequestException(
          `Нельзя отменить закупку товара ${item.productId}: остаточная стоимость станет отрицательной. Используйте Корректировку или Возврат.`,
        );
      }
    }
  }

  private async applyInventoryMovements(
    tx: Prisma.TransactionClient,
    purchase: PurchaseContext,
    items: PreparedPurchaseItem[],
  ) {
    const storeId = purchase.storeId;
    const productIds = items.map((i) => i.productId);

    // Fetch existing stocks in batch
    const existingStocks = await tx.stock.findMany({
      where: {
        storeId,
        productId: { in: productIds },
      },
    });
    const stockMap = new Map<string, (typeof existingStocks)[0]>(
      existingStocks.map((s) => [s.productId, s]),
    );

    // Process stock updates strictly sequentially
    for (const item of items) {
      const stock = stockMap.get(item.productId);

      const oldQty = stock ? stock.quantity : new Decimal(0);
      const oldWap = stock ? stock.averagePurchasePrice : new Decimal(0);

      // Calculate new Quantity
      const newQty = oldQty.add(item.quantity);

      // Calculate WAP using helper
      const newWap = this.inventoryService.calculateNewWap(
        oldQty,
        oldWap,
        item.quantity,
        item.price,
      );

      await tx.stock.upsert({
        where: {
          productId_storeId: { productId: item.productId, storeId },
        },
        create: {
          productId: item.productId,
          storeId,
          quantity: newQty,
          averagePurchasePrice: newWap,
        },
        update: {
          quantity: newQty,
          averagePurchasePrice: newWap,
        },
      });

      // Audit: Log Stock Ledger
      await this.stockLedgerService.create(tx, {
        type: 'PURCHASE',
        storeId,
        productId: item.productId,
        quantity: item.quantity,
        date: purchase.date ?? new Date(),
        documentId: purchase.id ?? '',

        quantityBefore: oldQty,
        quantityAfter: newQty,

        averagePurchasePrice: newWap,
        transactionAmount: item.total, // Total for this item line in purchase is qty * price

        batchId: purchase.id,
        // userId: TODO: pass from context
      });
    }
  }

  async update(id: string, updateDto: UpdateDocumentPurchaseDto) {
    return this.prisma.$transaction(
      async (tx) => {
        const doc = await tx.documentPurchase.findUniqueOrThrow({
          where: { id },
          include: { items: true },
        });

        this.baseService.ensureDraft(doc.status);

        const { storeId, vendorId, date, items, notes } = updateDto;
        const docDate = date ? new Date(date) : undefined;
        const safeItems = items || [];
        // 1. Prepare new Items
        const productIds = safeItems.map((i) => i.productId);

        // Validate products exist (Optional but good practice)
        const productsCount = await tx.product.count({
          where: { id: { in: productIds } },
        });
        if (productsCount !== productIds.length) {
          throw new BadRequestException('Некоторые товары не найдены');
        }

        const preparedItems = safeItems.map((item) => {
          const quantity = new Decimal(item.quantity);
          const price = new Decimal(item.price);
          return {
            productId: item.productId,
            quantity,
            price,
            total: quantity.mul(price),
            newPrices: item.newPrices,
          };
        });

        const total = preparedItems.reduce((sum, item) => sum.add(item.total), new Decimal(0));

        // 2. Delete existing items
        await tx.documentPurchaseItem.deleteMany({
          where: { purchaseId: id },
        });

        // 3. Update Document
        const updatedDoc = await tx.documentPurchase.update({
          where: { id },
          data: {
            storeId,
            vendorId,
            date: docDate,
            notes,
            total,
            items: {
              create: preparedItems.map((i) => ({
                productId: i.productId,
                quantity: i.quantity,
                price: i.price,
                total: i.total,
              })),
            },
          },
          include: { items: true },
        });

        // 4. Log Changes
        const headerChanges: Record<string, any> = {};
        if (notes !== undefined && notes !== (doc.notes ?? '')) headerChanges.notes = notes;
        if (storeId !== undefined && storeId !== doc.storeId) headerChanges.storeId = storeId;
        if (vendorId !== undefined && vendorId !== doc.vendorId) headerChanges.vendorId = vendorId;
        if (date && new Date(date).getTime() !== new Date(doc.date).getTime())
          headerChanges.date = date;

        if (Object.keys(headerChanges).length > 0) {
          await this.ledgerService.logAction(tx, {
            documentId: id,
            documentType: 'documentPurchase',
            action: 'UPDATED',
            details: headerChanges,
          });
        }

        // Use logDiff to track item changes (Added/Removed/Changed)
        await this.ledgerService.logDiff(
          tx,
          { documentId: id, documentType: 'documentPurchase' },
          doc.items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            price: i.price,
          })),
          preparedItems.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            price: i.price,
          })),
          ['quantity', 'price'],
        );

        // --- Handle Automatic DocumentPriceChange ---
        await this.handlePriceChanges(
          tx,
          id,
          updatedDoc.code,
          docDate || updatedDoc.date,
          preparedItems,
        );
        // ---------------------------------------------

        return updatedDoc;
      },
      {
        isolationLevel: 'ReadCommitted', // Sufficient for DRAFT updates
      },
    );
  }

  findAll() {
    return this.prisma.documentPurchase.findMany({
      include: {
        store: true,
        vendor: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  findOne(id: string) {
    return this.prisma.documentPurchase.findUniqueOrThrow({
      where: { id },
      include: {
        items: {
          include: { product: true },
        },
        documentLedger: {
          orderBy: { createdAt: 'asc' },
        },
        vendor: true,
        store: true,
      },
    });
  }

  private async handlePriceChanges(
    tx: Prisma.TransactionClient,
    purchaseId: string,
    purchaseCode: string,
    date: Date,
    items: PreparedPurchaseItem[],
  ) {
    const itemsWithNewPrices = items.filter((i) => i.newPrices && i.newPrices.length > 0);

    if (itemsWithNewPrices.length === 0) {
      return;
    }

    // Flatten all price updates into a single list
    const priceChangeItems: {
      productId: string;
      priceTypeId: string;
      newValue: Decimal;
      oldValue: number | Decimal;
    }[] = [];

    for (const item of itemsWithNewPrices) {
      for (const priceUpdate of item.newPrices!) {
        const currentPrice = await tx.price.findUnique({
          where: {
            productId_priceTypeId: {
              productId: item.productId,
              priceTypeId: priceUpdate.priceTypeId,
            },
          },
        });

        priceChangeItems.push({
          productId: item.productId,
          priceTypeId: priceUpdate.priceTypeId,
          newValue: new Decimal(priceUpdate.value),
          oldValue: currentPrice?.value || 0,
        });
      }
    }

    if (priceChangeItems.length === 0) {
      return;
    }

    // Delete existing price change for this purchase if it exists (and is DRAFT)
    const existing = await tx.documentPriceChange.findUnique({
      where: { documentPurchaseId: purchaseId },
    });

    if (existing) {
      if (existing.status !== 'DRAFT') {
        // If already completed, we don't automatically update it
        return;
      }
      await tx.documentPriceChange.delete({ where: { id: existing.id } });
    }

    // Generate code for DocumentPriceChange
    const priceChangeCode = await this.codeGenerator.getNextPriceChangeCode();

    // Create the new linked Price Change Document
    await tx.documentPriceChange.create({
      data: {
        code: priceChangeCode,
        date,
        status: 'DRAFT',
        notes: `Автоматически создан на основе закупки №${purchaseCode}`,
        documentPurchaseId: purchaseId,
        items: {
          create: priceChangeItems,
        },
      },
    });
  }
}
