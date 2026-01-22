import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import { InventoryService } from '../core/inventory/inventory.service';
import { Prisma } from '../generated/prisma/client';
import { CreateDocumentReturnDto } from './dto/create-document-return.dto';
import { StoreService } from '../store/store.service';
import { StockLedgerService } from '../stock-ledger/stock-ledger.service';
import { DocumentLedgerService } from '../document-ledger/document-ledger.service';
import { BaseDocumentService } from '../common/base-document.service';
import Decimal = Prisma.Decimal;

interface PreparedReturnItem {
  productId: string;
  quantity: Decimal;
  fallbackWap: Decimal;
}

interface ReturnContext {
  id?: string;
  storeId: string;
  date?: Date;
}

@Injectable()
export class DocumentReturnService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly storeService: StoreService,
    private readonly stockLedgerService: StockLedgerService,
    private readonly ledgerService: DocumentLedgerService,
    private readonly baseService: BaseDocumentService,
  ) {}

  async create(createDocumentReturnDto: CreateDocumentReturnDto) {
    const { storeId, clientId, date, status, items, notes } = createDocumentReturnDto;

    let targetStatus = status || 'DRAFT';
    const safeItems = items || [];
    const docDate = date ? new Date(date) : new Date();

    if (targetStatus === 'COMPLETED' && docDate > new Date()) {
      (targetStatus as any) = 'SCHEDULED';
    }

    // 1. Validate Store
    await this.storeService.validateStore(storeId);

    // 2. Prepare Items
    const productIds = safeItems.map((i) => i.productId);

    // Fetch fallback WAPs for all products in one go
    const wapMap = await this.inventoryService.getFallbackWapMap(productIds);

    // Calculate totals & Prepare items
    let total = new Decimal(0);
    const returnItems = safeItems.map((item) => {
      // Default price to 0 if not provided
      const price = new Decimal(item.price || 0);
      const quantity = new Decimal(item.quantity);
      const itemTotal = quantity.mul(price);
      total = total.add(itemTotal);

      // Determine fallback WAP for this product
      // Strategy: Use WAP from another store if available
      const fallbackWap = wapMap.get(item.productId) || new Decimal(0);

      return {
        productId: item.productId,
        quantity,
        price,
        total,
        fallbackWap,
      };
    });

    const result = await this.prisma.$transaction(
      async (tx) => {
        const doc = await tx.documentReturn.create({
          data: {
            storeId,
            clientId,
            date: docDate,
            status: targetStatus,
            notes,
            total,
            items: {
              create: returnItems.map((i) => ({
                productId: i.productId,
                quantity: i.quantity,
                price: i.price,
                total: i.total,
              })),
            },
          },
          include: { items: true },
        });

        // Log CREATED
        await this.ledgerService.logAction(tx, {
          documentId: doc.id,
          documentType: 'documentReturn',
          action: 'CREATED',
          details: { status: targetStatus, total, notes },
        });

        // Log Items
        for (const item of returnItems) {
          await this.ledgerService.logAction(tx, {
            documentId: doc.id,
            documentType: 'documentReturn',
            action: 'ITEM_ADDED',
            details: {
              productId: item.productId,
              quantity: item.quantity,
              price: item.price,
              total: item.total,
            },
          });
        }

        let reprocessingId: string | null = null;
        if (doc.status === 'COMPLETED' && returnItems.length > 0) {
          await this.applyInventoryMovements(tx, doc, returnItems);

          reprocessingId = await this.inventoryService.triggerReprocessingIfNeeded(tx, {
            storeId,
            productId: productIds,
            date: docDate,
            documentId: doc.id,
            documentType: 'documentReturn',
          });
        }

        return { doc, reprocessingId };
      },
      {
        isolationLevel: 'ReadCommitted',
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

  async updateStatus(id: string, newStatus: 'DRAFT' | 'COMPLETED' | 'CANCELLED') {
    let reprocessingId: string | null = null;
    let productsToReprocess: string[] = [];

    const updatedDoc = await this.prisma.$transaction(
      async (tx) => {
        const doc = await tx.documentReturn.findUniqueOrThrow({
          where: { id },
          include: { items: true },
        });

        const oldStatus = doc.status;
        let actualNewStatus = newStatus;

        if (newStatus === 'COMPLETED' && doc.date > new Date()) {
          (actualNewStatus as any) = 'SCHEDULED';
        }

        if (oldStatus === actualNewStatus) {
          return doc;
        }

        if (oldStatus === 'CANCELLED') {
          throw new BadRequestException('Нельзя изменить статус отмененного документа');
        }

        const productIds = doc.items.map((i) => i.productId);
        const wapMap = await this.inventoryService.getFallbackWapMap(productIds);

        const items = doc.items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          fallbackWap: wapMap.get(i.productId) || new Decimal(0),
        }));

        // DRAFT/SCHEDULED -> COMPLETED
        if (
          (oldStatus === 'DRAFT' || oldStatus === 'SCHEDULED') &&
          actualNewStatus === 'COMPLETED'
        ) {
          await this.applyInventoryMovements(tx, doc, items);

          // Check for backdated reprocessing
          reprocessingId = await this.inventoryService.triggerReprocessingIfNeeded(tx, {
            storeId: doc.storeId,
            productId: productIds,
            date: doc.date,
            documentId: doc.id,
            documentType: 'documentReturn',
          });
          if (reprocessingId) {
            productsToReprocess = productIds;
          }
        }

        // COMPLETED -> DRAFT (or CANCELLED or SCHEDULED)
        if (
          oldStatus === 'COMPLETED' &&
          (actualNewStatus === 'DRAFT' ||
            actualNewStatus === 'CANCELLED' ||
            actualNewStatus === 'SCHEDULED')
        ) {
          // Revert stock (Decrease Stock)

          // 1. Validate Stock Availability (Must have enough to remove)
          await this.validateStockForRevert(tx, doc.storeId, items);

          // 2. Apply revert (negative quantity)
          const revertItems = items.map((i) => ({
            ...i,
            quantity: i.quantity.negated(),
          }));

          await this.applyInventoryMovements(tx, doc, revertItems);

          // ALWAYS trigger reprocessing for REVERT
          const reprocessing = await tx.inventoryReprocessing.create({
            data: {
              status: 'PENDING',
              documentReturnId: doc.id,
              date: doc.date,
            },
          });
          reprocessingId = reprocessing.id;
          productsToReprocess = productIds;
        }

        await this.ledgerService.logAction(tx, {
          documentId: id,
          documentType: 'documentReturn',
          action: 'STATUS_CHANGED',
          details: { from: oldStatus, to: newStatus },
        });

        return tx.documentReturn.update({
          where: { id },
          where: { id },
          data: { status: actualNewStatus },
          include: { items: true },
        });
      },
      {
        isolationLevel: 'Serializable',
      },
    );

    // POST-TRANSACTION: Reprocess History
    if (reprocessingId && productsToReprocess.length > 0) {
      for (const pid of productsToReprocess) {
        await this.inventoryService.reprocessProductHistory(
          updatedDoc.storeId,
          pid,
          updatedDoc.date,
          reprocessingId,
        );
      }
      await this.inventoryService.completeReprocessing(reprocessingId);
    }

    return updatedDoc;
  }

  private async validateStockForRevert(
    tx: Prisma.TransactionClient,
    storeId: string,
    items: PreparedReturnItem[],
  ) {
    // To revert a return, we remove items from stock.
    // We must ensure stock >= items.quantity
    const productIds = items.map((i) => i.productId);
    const stocks = await tx.stock.findMany({
      where: { storeId, productId: { in: productIds } },
    });
    const stockMap = new Map(stocks.map((s) => [s.productId, s.quantity]));

    for (const item of items) {
      const currentQty = stockMap.get(item.productId) || new Decimal(0);

      if (currentQty.lessThan(item.quantity)) {
        throw new BadRequestException(
          `Недостаточно остатка товара ${item.productId} для отмены возврата (товар уже продан или перемещен)`,
        );
      }
    }
  }

  private async applyInventoryMovements(
    tx: Prisma.TransactionClient,
    doc: ReturnContext,
    items: PreparedReturnItem[],
  ) {
    const storeId = doc.storeId;

    for (const item of items) {
      // Use atomic increment for concurrency safety
      // Upsert handles both "creation of new stock" and "update of existing"
      await tx.stock.upsert({
        where: {
          productId_storeId: { productId: item.productId, storeId },
        },
        create: {
          productId: item.productId,
          storeId,
          quantity: item.quantity,
          averagePurchasePrice: item.fallbackWap, // Use fetched fallback instead of 0
        },
        update: {
          quantity: { increment: item.quantity },
          // Note: We deliberately do NOT update WAP on return (as agreed),
          // assuming the returned item has the same cost structure or is negligible.
        },
      });

      // Fetch updated stock for accurate snapshot
      const updatedStock = await tx.stock.findUniqueOrThrow({
        where: {
          productId_storeId: { productId: item.productId, storeId },
        },
      });

      // Audit: Log Stock Movement
      await this.stockLedgerService.create(tx, {
        type: 'RETURN',
        storeId,
        productId: item.productId,
        quantity: item.quantity,
        date: doc.date ?? new Date(),
        documentId: doc.id ?? '',

        quantityBefore: updatedStock.quantity.sub(item.quantity), // Derived
        quantityAfter: updatedStock.quantity,

        averagePurchasePrice: updatedStock.averagePurchasePrice,
        transactionAmount: item.quantity.mul(updatedStock.averagePurchasePrice), // Value at current WAP or created WAP

        batchId: doc.id,
      });
    }
  }

  async update(id: string, updateDto: CreateDocumentReturnDto) {
    return this.prisma.$transaction(
      async (tx) => {
        const doc = await tx.documentReturn.findUniqueOrThrow({
          where: { id },
          include: { items: true },
        });

        this.baseService.ensureDraft(doc.status);

        const { storeId, clientId, date, items, notes } = updateDto;
        const docDate = date ? new Date(date) : new Date();
        const safeItems = items || [];

        // Store old items for diff logging
        const oldItems = doc.items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          price: i.price,
        }));

        // 1. Prepare Items
        const productIds = safeItems.map((i) => i.productId);
        const wapMap = await this.inventoryService.getFallbackWapMap(productIds);

        let total = new Decimal(0);
        const returnItems = safeItems.map((item) => {
          const price = new Decimal(item.price || 0);
          const quantity = new Decimal(item.quantity);
          const itemTotal = quantity.mul(price);
          total = total.add(itemTotal);
          const fallbackWap = wapMap.get(item.productId) || new Decimal(0);

          return {
            productId: item.productId,
            quantity,
            price,
            total,
            fallbackWap,
          };
        });

        // 2. Delete existing items
        await tx.documentReturnItem.deleteMany({
          where: { returnId: id },
        });

        // 3. Update Document
        const updatedDoc = await tx.documentReturn.update({
          where: { id },
          data: {
            storeId,
            clientId,
            date: docDate,
            total,
            notes,
            items: {
              create: returnItems.map((i) => ({
                productId: i.productId,
                quantity: i.quantity,
                price: i.price,
                total: i.total,
              })),
            },
          },
          include: { items: true },
        });

        // Log Update (notes etc)
        const changes: Record<string, any> = {};
        if (notes !== undefined && notes !== (doc.notes ?? '')) {
          changes.notes = notes;
        }
        if (storeId !== doc.storeId) {
          changes.storeId = storeId;
        }
        if (clientId !== doc.clientId) {
          changes.clientId = clientId;
        }
        if (date && new Date(date).getTime() !== doc.date?.getTime()) {
          changes.date = date;
        }

        if (Object.keys(changes).length > 0) {
          await this.ledgerService.logAction(tx, {
            documentId: id,
            documentType: 'documentReturn',
            action: 'UPDATED',
            details: changes,
          });
        }

        // Log Diffs
        await this.ledgerService.logDiff(
          tx,
          {
            documentId: id,
            documentType: 'documentReturn',
          },
          oldItems,
          returnItems,
          ['quantity', 'price'],
        );
        return updatedDoc;
      },
      {
        isolationLevel: 'ReadCommitted',
      },
    );
  }

  findAll(include?: Record<string, boolean>) {
    return this.prisma.documentReturn.findMany({
      include,
      orderBy: { createdAt: 'desc' },
    });
  }

  findOne(id: string) {
    return this.prisma.documentReturn.findUniqueOrThrow({
      where: { id },
      include: {
        items: true,
        client: true,
        store: true,
        documentLedger: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }
}
