import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { DocumentStatus } from '../generated/prisma/enums';
import { PrismaService } from '../core/prisma/prisma.service';
import { InventoryService } from '../core/inventory/inventory.service';
import {
  CreateDocumentAdjustmentDto,
  CreateDocumentAdjustmentItemDto,
} from './dto/create-document-adjustment.dto';
import { StoreService } from '../store/store.service';
import { StockLedgerService } from '../stock-ledger/stock-ledger.service';
import { DocumentLedgerService } from '../document-ledger/document-ledger.service';
import { BaseDocumentService } from '../common/base-document.service';
import { CodeGeneratorService } from '../core/code-generator/code-generator.service';
import Decimal = Prisma.Decimal;

interface PreparedAdjustmentItem {
  productId: string;
  quantityRelative: Decimal;
  quantityBefore: Decimal;
  quantityAfter: Decimal;
}

interface AdjustmentContext {
  id?: string;
  storeId: string;
  date?: Date;
}

@Injectable()
export class DocumentAdjustmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly storeService: StoreService,
    private readonly stockLedgerService: StockLedgerService,
    private readonly ledgerService: DocumentLedgerService,
    private readonly baseService: BaseDocumentService,
    private readonly codeGenerator: CodeGeneratorService,
  ) {}

  async create(createDocumentAdjustmentDto: CreateDocumentAdjustmentDto) {
    const { storeId, date, status, notes } = createDocumentAdjustmentDto;

    let targetStatus = status || 'DRAFT';
    const docDate = date ? new Date(date) : new Date();

    if (targetStatus === 'COMPLETED' && docDate > new Date()) {
      (targetStatus as any) = 'SCHEDULED';
    }

    // 1. Validate Store
    await this.storeService.validateStore(storeId);

    const doc = await this.prisma.$transaction(async (tx) => {
      // Generate Code
      const code = await this.codeGenerator.getNextAdjustmentCode();

      // 4. Create Document
      const newDoc = await tx.documentAdjustment.create({
        data: {
          code,
          storeId,
          date: docDate,
          status: targetStatus,
          notes,
        },
      });

      await this.ledgerService.logAction(tx, {
        documentId: newDoc.id,
        documentType: 'documentAdjustment',
        action: 'CREATED',
        details: { status: targetStatus, notes },
      });

      return newDoc;
    });

    return doc;
  }

  async update(id: string, updateDto: CreateDocumentAdjustmentDto) {
    return this.prisma.$transaction(async (tx) => {
      const doc = await tx.documentAdjustment.findUniqueOrThrow({
        where: { id },
      });

      this.baseService.ensureDraft(doc.status);

      const { storeId, date, notes } = updateDto;
      const docDate = date ? new Date(date) : new Date();

      const updatedDoc = await tx.documentAdjustment.update({
        where: { id },
        data: {
          storeId,
          date: docDate,
          notes,
        },
      });

      const changes: Record<string, any> = {};
      if (notes !== undefined && notes !== (doc.notes ?? '')) {
        changes.notes = notes;
      }
      if (storeId !== doc.storeId) {
        changes.storeId = storeId;
      }
      if (date && new Date(date).getTime() !== doc.date?.getTime()) {
        changes.date = date;
      }

      if (Object.keys(changes).length > 0) {
        await this.ledgerService.logAction(tx, {
          documentId: updatedDoc.id,
          documentType: 'documentAdjustment',
          action: 'UPDATED',
          details: changes,
        });
      }

      return updatedDoc;
    });
  }

  async addItem(id: string, dto: CreateDocumentAdjustmentItemDto) {
    return this.prisma.$transaction(
      async (tx) => {
        const doc = await tx.documentAdjustment.findUniqueOrThrow({
          where: { id },
          include: { items: true },
        });

        this.baseService.ensureDraft(doc.status);

        const { productId, quantity } = dto;
        const qDelta = new Decimal(quantity);

        // Fetch current stock to calculate snapshots
        const stock = await tx.stock.findUnique({
          where: { productId_storeId: { productId: productId!, storeId: doc.storeId } },
        });

        const quantityBefore = stock ? stock.quantity : new Decimal(0);
        const quantityAfter = quantityBefore.add(qDelta);

        const _newItem = await tx.documentAdjustmentItem.create({
          data: {
            adjustmentId: id,
            productId: productId!,
            quantity: qDelta,
            quantityBefore,
            quantityAfter,
          },
        });

        await this.ledgerService.logAction(tx, {
          documentId: id,
          documentType: 'documentAdjustment',
          action: 'ITEM_ADDED',
          details: { productId, quantity: qDelta },
        });

        return tx.documentAdjustment.findUniqueOrThrow({
          where: { id },
          include: {
            items: true,
            store: true,
            documentLedger: {
              orderBy: { createdAt: 'asc' },
            },
          },
        });
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async updateItem(id: string, itemId: string, dto: CreateDocumentAdjustmentItemDto) {
    return this.prisma.$transaction(
      async (tx) => {
        const doc = await tx.documentAdjustment.findUniqueOrThrow({
          where: { id },
        });

        this.baseService.ensureDraft(doc.status);

        const item = await tx.documentAdjustmentItem.findUniqueOrThrow({
          where: { id: itemId },
        });

        const { quantity } = dto;
        const qDelta = new Decimal(quantity);

        // Recalculate snapshots based on original quantityBefore
        const quantityAfter = item.quantityBefore.add(qDelta);

        const _updatedItem = await tx.documentAdjustmentItem.update({
          where: { id: itemId },
          data: {
            quantity: qDelta,
            quantityAfter,
          },
        });

        await this.ledgerService.logAction(tx, {
          documentId: id,
          documentType: 'documentAdjustment',
          action: 'ITEM_CHANGED',
          details: {
            productId: item.productId,
            oldQuantity: item.quantity,
            newQuantity: qDelta,
          },
        });

        return tx.documentAdjustment.findUniqueOrThrow({
          where: { id },
          include: {
            items: true,
            store: true,
            documentLedger: {
              orderBy: { createdAt: 'asc' },
            },
          },
        });
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async removeItem(id: string, itemId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const doc = await tx.documentAdjustment.findUniqueOrThrow({
          where: { id },
        });

        this.baseService.ensureDraft(doc.status);

        const item = await tx.documentAdjustmentItem.findUniqueOrThrow({
          where: { id: itemId },
        });

        await tx.documentAdjustmentItem.delete({
          where: { id: itemId },
        });

        await this.ledgerService.logAction(tx, {
          documentId: id,
          documentType: 'documentAdjustment',
          action: 'ITEM_REMOVED',
          details: { productId: item.productId, quantity: item.quantity },
        });

        return tx.documentAdjustment.findUniqueOrThrow({
          where: { id },
          include: {
            items: true,
            store: true,
            documentLedger: {
              orderBy: { createdAt: 'asc' },
            },
          },
        });
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async updateStatus(id: string, newStatus: DocumentStatus) {
    let reprocessingId: string | null = null;
    let productsToReprocess: string[] = [];

    const updatedDoc = await this.prisma.$transaction(
      async (tx) => {
        const doc = await tx.documentAdjustment.findUniqueOrThrow({
          where: { id },
          include: { items: true },
        });

        let actualNewStatus = newStatus;

        if (newStatus === 'COMPLETED' && doc.date > new Date()) {
          (actualNewStatus as any) = 'SCHEDULED';
        }

        if (doc.status === actualNewStatus) {
          return doc;
        }

        const productIds = doc.items.map((i) => i.productId);
        const fallbackWapMap = await this.inventoryService.getFallbackWapMap(productIds);

        // DRAFT/SCHEDULED -> COMPLETED
        if (
          (doc.status === 'DRAFT' || doc.status === 'SCHEDULED') &&
          actualNewStatus === 'COMPLETED'
        ) {
          const existingStocks = await tx.stock.findMany({
            where: {
              storeId: doc.storeId,
              productId: { in: productIds },
            },
          });
          const stockMap = new Map(existingStocks.map((s) => [s.productId, s]));

          const preparedItems: PreparedAdjustmentItem[] = [];
          for (const item of doc.items) {
            const stock = stockMap.get(item.productId);
            const quantity = item.quantity;
            const oldQty = stock ? stock.quantity : new Decimal(0);
            const newQty = oldQty.add(quantity);

            await tx.documentAdjustmentItem.update({
              where: { id: item.id },
              data: {
                quantityBefore: oldQty,
                quantityAfter: newQty,
              },
            });

            preparedItems.push({
              productId: item.productId,
              quantityRelative: quantity,
              quantityBefore: oldQty,
              quantityAfter: newQty,
            });
          }

          await this.applyInventoryMovements(tx, doc, preparedItems, fallbackWapMap);

          // Check for backdated reprocessing
          reprocessingId = await this.inventoryService.triggerReprocessingIfNeeded(tx, {
            storeId: doc.storeId,
            productId: productIds,
            date: doc.date,
            documentId: doc.id,
            documentType: 'documentAdjustment',
          });
          if (reprocessingId) {
            productsToReprocess = productIds;
          }
        }

        // COMPLETED -> DRAFT/CANCELLED/SCHEDULED
        else if (
          doc.status === 'COMPLETED' &&
          (actualNewStatus === 'DRAFT' ||
            actualNewStatus === 'CANCELLED' ||
            actualNewStatus === 'SCHEDULED')
        ) {
          const existingStocks = await tx.stock.findMany({
            where: {
              storeId: doc.storeId,
              productId: { in: productIds },
            },
          });
          const stockMap = new Map(existingStocks.map((s) => [s.productId, s]));

          const revertItems: PreparedAdjustmentItem[] = [];
          for (const item of doc.items) {
            const stock = stockMap.get(item.productId);
            const currentQty = stock ? stock.quantity : new Decimal(0);
            const delta = item.quantity;
            const revertedQty = currentQty.sub(delta);

            revertItems.push({
              productId: item.productId,
              quantityRelative: delta.negated(),
              quantityBefore: currentQty,
              quantityAfter: revertedQty,
            });
          }

          await this.applyInventoryMovements(tx, doc, revertItems, fallbackWapMap);

          // ALWAYS trigger reprocessing for REVERT
          const reprocessing = await tx.inventoryReprocessing.create({
            data: {
              status: 'PENDING',
              documentAdjustmentId: doc.id,
              date: doc.date,
            },
          });
          reprocessingId = reprocessing.id;
          productsToReprocess = productIds;
        }

        await this.ledgerService.logAction(tx, {
          documentId: id,
          documentType: 'documentAdjustment',
          action: 'STATUS_CHANGED',
          details: { from: doc.status, to: newStatus },
        });

        return tx.documentAdjustment.update({
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

  private async applyInventoryMovements(
    tx: Prisma.TransactionClient,
    doc: AdjustmentContext,
    items: PreparedAdjustmentItem[],
    fallbackWapMap: Map<string, Decimal>,
  ) {
    const storeId = doc.storeId;

    // Fetch stocks again if needed, but here we can just do upserts
    for (const item of items) {
      // Find current WAP
      const stock = await tx.stock.findUnique({
        where: { productId_storeId: { productId: item.productId, storeId } },
      });

      let currentWap = new Decimal(0);
      if (stock) {
        currentWap = stock.averagePurchasePrice;
      } else {
        currentWap = fallbackWapMap.get(item.productId) || new Decimal(0);
      }

      const qAfter = item.quantityAfter;
      const qDelta = item.quantityRelative;

      await tx.stock.upsert({
        where: {
          productId_storeId: { productId: item.productId, storeId },
        },
        create: {
          productId: item.productId,
          storeId,
          quantity: qAfter,
          averagePurchasePrice: currentWap,
        },
        update: {
          quantity: qAfter,
        },
      });

      // Audit: Log Stock Movement
      await this.stockLedgerService.create(tx, {
        type: 'ADJUSTMENT',
        storeId,
        productId: item.productId,
        quantity: qDelta,
        date: doc.date ?? new Date(),
        documentId: doc.id ?? '',

        quantityBefore: item.quantityBefore, // Passed from preparation logic
        quantityAfter: qAfter,

        averagePurchasePrice: currentWap,
        transactionAmount: qDelta.mul(currentWap),

        batchId: doc.id,
      });
    }
  }

  findAll(include?: Record<string, boolean>) {
    return this.prisma.documentAdjustment.findMany({
      include,
      orderBy: { createdAt: 'desc' },
    });
  }

  findOne(id: string) {
    return this.prisma.documentAdjustment.findUniqueOrThrow({
      where: { id },
      include: {
        items: true,
        store: true,
        documentLedger: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }
}
