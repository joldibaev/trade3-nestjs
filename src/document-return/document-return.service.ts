import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import { InventoryService } from '../core/inventory/inventory.service';
import { Prisma } from '../generated/prisma/client';
import { DocumentStatus } from '../generated/prisma/enums';
import {
  CreateDocumentReturnDto,
  CreateDocumentReturnItemDto,
} from './dto/create-document-return.dto';
import { StoreService } from '../store/store.service';
import { StockLedgerService } from '../stock-ledger/stock-ledger.service';
import { DocumentLedgerService } from '../document-ledger/document-ledger.service';
import { BaseDocumentService } from '../common/base-document.service';
import { CodeGeneratorService } from '../core/code-generator/code-generator.service';
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
    private readonly codeGenerator: CodeGeneratorService,
  ) {}

  async create(createDocumentReturnDto: CreateDocumentReturnDto) {
    const { storeId, clientId, date, status, notes } = createDocumentReturnDto;

    let targetStatus = status || 'DRAFT';
    const docDate = date ? new Date(date) : new Date();

    if (targetStatus === 'COMPLETED' && docDate > new Date()) {
      targetStatus = 'SCHEDULED' as DocumentStatus;
    }

    // 1. Validate Store
    await this.storeService.validateStore(storeId);

    const doc = await this.prisma.$transaction(async (tx) => {
      // Generate Code
      const code = await this.codeGenerator.getNextReturnCode();

      const newDoc = await tx.documentReturn.create({
        data: {
          code,
          storeId,
          clientId,
          date: docDate,
          status: targetStatus,
          notes,
          total: 0,
        },
      });

      // Log CREATED
      await this.ledgerService.logAction(tx, {
        documentId: newDoc.id,
        documentType: 'documentReturn',
        action: 'CREATED',
        details: { status: targetStatus, notes },
      });

      return newDoc;
    });

    return doc;
  }

  async update(id: string, updateDto: CreateDocumentReturnDto) {
    return this.prisma.$transaction(async (tx) => {
      const doc = await tx.documentReturn.findUniqueOrThrow({
        where: { id },
      });

      this.baseService.ensureDraft(doc.status);

      const { storeId, clientId, date, notes } = updateDto;
      const docDate = date ? new Date(date) : new Date();

      const updatedDoc = await tx.documentReturn.update({
        where: { id },
        data: {
          storeId,
          clientId,
          date: docDate,
          notes,
        },
      });

      const changes: Record<string, unknown> = {};
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

      return updatedDoc;
    });
  }

  async addItems(id: string, itemsDto: CreateDocumentReturnItemDto[]) {
    return this.prisma.$transaction(
      async (tx) => {
        const doc = await tx.documentReturn.findUniqueOrThrow({
          where: { id },
        });

        this.baseService.ensureDraft(doc.status);

        let totalAddition = new Decimal(0);

        for (const dto of itemsDto) {
          const { productId, quantity, price } = dto;
          const qDelta = new Decimal(quantity);
          const pVal = new Decimal(price || 0);
          const itemTotal = qDelta.mul(pVal);
          totalAddition = totalAddition.add(itemTotal);

          await tx.documentReturnItem.create({
            data: {
              returnId: id,
              productId: productId!,
              quantity: qDelta,
              price: pVal,
              total: itemTotal,
            },
          });

          await this.ledgerService.logAction(tx, {
            documentId: id,
            documentType: 'documentReturn',
            action: 'ITEM_ADDED',
            details: { productId, quantity: qDelta, price: pVal, total: itemTotal },
          });
        }

        await tx.documentReturn.update({
          where: { id },
          data: { total: { increment: totalAddition } },
        });

        return tx.documentReturn.findUniqueOrThrow({
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
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }

  async updateItem(id: string, itemId: string, dto: CreateDocumentReturnItemDto) {
    return this.prisma.$transaction(
      async (tx) => {
        const doc = await tx.documentReturn.findUniqueOrThrow({
          where: { id },
        });

        this.baseService.ensureDraft(doc.status);

        const item = await tx.documentReturnItem.findUniqueOrThrow({
          where: { id: itemId },
        });

        const { quantity, price } = dto;
        const qDelta = new Decimal(quantity);
        const pVal = new Decimal(price || 0);
        const newTotal = qDelta.mul(pVal);
        const amountDiff = newTotal.sub(item.total);

        const _updatedItem = await tx.documentReturnItem.update({
          where: { id: itemId },
          data: {
            quantity: qDelta,
            price: pVal,
            total: newTotal,
          },
        });

        await tx.documentReturn.update({
          where: { id },
          data: { total: { increment: amountDiff } },
        });

        await this.ledgerService.logAction(tx, {
          documentId: id,
          documentType: 'documentReturn',
          action: 'ITEM_CHANGED',
          details: {
            productId: item.productId,
            oldQuantity: item.quantity,
            newQuantity: qDelta,
            oldPrice: item.price,
            newPrice: pVal,
          },
        });

        return tx.documentReturn.findUniqueOrThrow({
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
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }

  async removeItems(id: string, itemIds: string[]) {
    return this.prisma.$transaction(
      async (tx) => {
        const doc = await tx.documentReturn.findUniqueOrThrow({
          where: { id },
        });

        this.baseService.ensureDraft(doc.status);

        let totalSubtraction = new Decimal(0);

        for (const itemId of itemIds) {
          const item = await tx.documentReturnItem.findUniqueOrThrow({
            where: { id: itemId },
          });

          await tx.documentReturnItem.delete({
            where: { id: itemId },
          });

          totalSubtraction = totalSubtraction.add(item.total);

          await this.ledgerService.logAction(tx, {
            documentId: id,
            documentType: 'documentReturn',
            action: 'ITEM_REMOVED',
            details: { productId: item.productId, quantity: item.quantity, total: item.total },
          });
        }

        await tx.documentReturn.update({
          where: { id },
          data: { total: { decrement: totalSubtraction } },
        });

        return tx.documentReturn.findUniqueOrThrow({
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
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }

  async updateStatus(id: string, newStatus: DocumentStatus) {
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
          actualNewStatus = 'SCHEDULED' as DocumentStatus;
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
