import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { DocumentStatus } from '../generated/prisma/enums';
import { PrismaService } from '../core/prisma/prisma.service';
import { InventoryService } from '../core/inventory/inventory.service';
import { CreateDocumentAdjustmentDto } from './dto/create-document-adjustment.dto';
import { StoreService } from '../store/store.service';
import { StockLedgerService } from '../stock-ledger/stock-ledger.service';
import { DocumentLedgerService } from '../document-ledger/document-ledger.service';
import { BaseDocumentService } from '../common/base-document.service';
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
  ) {}

  async create(createDocumentAdjustmentDto: CreateDocumentAdjustmentDto) {
    const { storeId, date, status, items, notes } = createDocumentAdjustmentDto;

    let targetStatus = status || 'DRAFT';
    const docDate = date ? new Date(date) : new Date();

    if (targetStatus === 'COMPLETED' && docDate > new Date()) {
      (targetStatus as any) = 'SCHEDULED';
    }

    // 1. Validate Store
    await this.storeService.validateStore(storeId);

    const safeItems = items || [];

    // Prepare IDs
    const productIds = safeItems.map((i) => i.productId);

    // 1a. Pre-fetch Fallback WAPs (checking other stores)
    const fallbackWapMap = await this.inventoryService.getFallbackWapMap(productIds);

    const result = await this.prisma.$transaction(
      async (tx) => {
        let preparedItems: PreparedAdjustmentItem[] = [];

        if (safeItems.length > 0) {
          // 2. Batch Fetch Existing Stocks (Current Store) - MUST be inside TX
          const existingStocks = await tx.stock.findMany({
            where: {
              storeId,
              productId: { in: productIds },
            },
          });
          const stockMap = new Map(existingStocks.map((s) => [s.productId, s]));

          // 3. Prepare Items Data (Calculate Before/After)
          preparedItems = safeItems.map((item) => {
            const stock = stockMap.get(item.productId);
            const quantity = new Decimal(item.quantity); // Delta

            const oldQty = stock ? stock.quantity : new Decimal(0);
            const newQty = oldQty.add(quantity);

            return {
              productId: item.productId,
              quantityRelative: quantity,
              quantityBefore: oldQty,
              quantityAfter: newQty,
            };
          });
        }

        // 4. Create Document with Items
        const doc = await tx.documentAdjustment.create({
          data: {
            storeId,
            date: docDate,
            status: targetStatus,
            notes,
            items: {
              create: preparedItems.map((i) => ({
                productId: i.productId,
                quantity: i.quantityRelative,
                quantityBefore: i.quantityBefore,
                quantityAfter: i.quantityAfter,
              })),
            },
          },
          include: { items: true },
        });

        await this.ledgerService.logAction(tx, {
          documentId: doc.id,
          documentType: 'documentAdjustment',
          action: 'CREATED',
          details: { status: targetStatus, notes },
        });

        for (const item of preparedItems) {
          await this.ledgerService.logAction(tx, {
            documentId: doc.id,
            documentType: 'documentAdjustment',
            action: 'ITEM_ADDED',
            details: {
              productId: item.productId,
              quantity: item.quantityRelative,
            },
          });
        }

        let reprocessingId: string | null = null;
        // 5. Update Stocks (Only if COMPLETED)
        if (targetStatus === 'COMPLETED' && preparedItems.length > 0) {
          await this.applyInventoryMovements(tx, doc, preparedItems, fallbackWapMap);

          reprocessingId = await this.inventoryService.triggerReprocessingIfNeeded(tx, {
            storeId,
            productId: preparedItems.map((i) => i.productId),
            date: docDate,
            documentId: doc.id,
            documentType: 'documentAdjustment',
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

  async update(id: string, updateDto: CreateDocumentAdjustmentDto) {
    return this.prisma.$transaction(
      async (tx) => {
        const doc = await tx.documentAdjustment.findUniqueOrThrow({
          where: { id },
          include: { items: true },
        });

        const oldItems = doc.items;

        this.baseService.ensureDraft(doc.status);

        // 1. Delete existing items
        await tx.documentAdjustmentItem.deleteMany({
          where: { adjustmentId: id },
        });

        // 2. Prepare new items
        const { storeId, date, items, notes } = updateDto;
        const docDate = date ? new Date(date) : new Date();
        const safeItems = items || [];
        const productIds = safeItems.map((i) => i.productId);
        // 2. Batch Fetch Existing Stocks (Current Store) - MUST be inside TX
        const existingStocks = await tx.stock.findMany({
          where: {
            storeId,
            productId: { in: productIds },
          },
        });
        const stockMap = new Map(existingStocks.map((s) => [s.productId, s]));

        // 3. Prepare Items Data (Calculate Before/After)
        const preparedItems = safeItems.map((item) => {
          const stock = stockMap.get(item.productId);
          const quantity = new Decimal(item.quantity); // Delta

          const oldQty = stock ? stock.quantity : new Decimal(0);
          const newQty = oldQty.add(quantity);

          return {
            productId: item.productId,
            quantityRelative: quantity,
            quantityBefore: oldQty,
            quantityAfter: newQty,
          };
        });

        const updatedDoc = await tx.documentAdjustment.update({
          where: { id },
          data: {
            storeId,
            date: docDate,
            notes,
            items: {
              create: preparedItems.map((i) => ({
                productId: i.productId,
                quantity: i.quantityRelative,
                quantityBefore: i.quantityBefore, // In draft these are tentative
                quantityAfter: i.quantityAfter,
              })),
            },
          },
          include: { items: true },
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

        // Log Diffs
        await this.ledgerService.logDiff(
          tx,
          {
            documentId: updatedDoc.id,
            documentType: 'documentAdjustment',
          },
          oldItems.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
          })),
          preparedItems.map((i) => ({
            productId: i.productId,
            quantity: i.quantityRelative,
          })),
          ['quantity'],
        );

        return updatedDoc;
      },
      {
        isolationLevel: 'Serializable',
      },
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
