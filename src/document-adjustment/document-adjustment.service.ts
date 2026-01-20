import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../core/prisma/prisma.service';
import { InventoryService } from '../core/inventory/inventory.service';
import { CreateDocumentAdjustmentDto } from './dto/create-document-adjustment.dto';
import { StoreService } from '../store/store.service';
import { StockMovementService } from '../stock-movement/stock-movement.service';
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
    private readonly stockMovementService: StockMovementService,
  ) { }

  async create(createDocumentAdjustmentDto: CreateDocumentAdjustmentDto) {
    const { storeId, date, status, items, notes } = createDocumentAdjustmentDto;

    const targetStatus = status || 'DRAFT';

    // 1. Validate Store
    await this.storeService.validateStore(storeId);

    const safeItems = items || [];

    // Prepare IDs
    const productIds = safeItems.map((i) => i.productId);

    // 1a. Pre-fetch Fallback WAPs (checking other stores)
    const fallbackWapMap = await this.inventoryService.getFallbackWapMap(productIds);

    return this.prisma.$transaction(
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
            date: date ? new Date(date) : new Date(),
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

        // 5. Update Stocks (Only if COMPLETED)
        if (targetStatus === 'COMPLETED' && preparedItems.length > 0) {
          await this.applyInventoryMovements(tx, doc, preparedItems, fallbackWapMap);
        }

        return doc;
      },
      {
        isolationLevel: 'Serializable',
      },
    );
  }

  async update(id: string, updateDto: CreateDocumentAdjustmentDto) {
    const { storeId, date, items, notes } = updateDto;
    const safeItems = items || [];

    return this.prisma.$transaction(
      async (tx) => {
        const doc = await tx.documentAdjustment.findUniqueOrThrow({
          where: { id },
        });

        if (doc.status !== 'DRAFT') {
          throw new BadRequestException('Только черновики могут быть изменены');
        }

        // 1. Delete existing items
        await tx.documentAdjustmentItem.deleteMany({
          where: { adjustmentId: id },
        });

        // 2. Prepare new items
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

        return tx.documentAdjustment.update({
          where: { id },
          data: {
            storeId,
            date: date ? new Date(date) : new Date(),
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
      },
      {
        isolationLevel: 'Serializable',
      },
    );
  }

  async remove(id: string) {
    return this.prisma.$transaction(async (tx) => {
      const doc = await tx.documentAdjustment.findUniqueOrThrow({
        where: { id },
      });

      if (doc.status !== 'DRAFT') {
        throw new BadRequestException('Только черновики могут быть удалены');
      }

      return tx.documentAdjustment.delete({
        where: { id },
      });
    });
  }

  async updateStatus(id: string, newStatus: 'DRAFT' | 'COMPLETED' | 'CANCELLED') {
    return this.prisma.$transaction(
      async (tx) => {
        const doc = await tx.documentAdjustment.findUniqueOrThrow({
          where: { id },
          include: { items: true },
        });

        if (doc.status === newStatus) {
          return doc;
        }

        const productIds = doc.items.map((i) => i.productId);
        const fallbackWapMap = await this.inventoryService.getFallbackWapMap(productIds);

        // DRAFT -> COMPLETED
        if (doc.status === 'DRAFT' && newStatus === 'COMPLETED') {
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
            const quantity = item.quantity; // Delta
            const oldQty = stock ? stock.quantity : new Decimal(0);
            const newQty = oldQty.add(quantity);

            // Update snapshots in the item with ACTUAL values at moment of completion
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
        }

        // COMPLETED -> DRAFT/CANCELLED
        else if (
          doc.status === 'COMPLETED' &&
          (newStatus === 'DRAFT' || newStatus === 'CANCELLED')
        ) {
          // Revert movements
          // We applied `add(quantity)`. To revert, we must `subtract(quantity)` => `add(-quantity)`.
          // applyInventoryMovements does UPSERT using the passed quantity as the NEW value or something?
          // Wait, let's look at applyInventoryMovements.

          // validation of applyInventoryMovements:
          // It calculates qAfter and qDelta.
          // It updates stock with qAfter.
          // It creates stockMovement with qDelta.

          // So to revert, we need to calculate what the stock WAS before.
          // Actually, we just need to apply the INVERSE delta to the CURRENT stock.
          // But applyInventoryMovements expects "quantityAfter".

          // Let's re-read applyInventoryMovements carefully.
          /*
             const qAfter = item.quantityAfter;
             const qDelta = item.quantityRelative;
             
             ... update stock set quantity = qAfter ...
          */

          // Make sure we calculate the CORRECT qAfter for reversion.
          // Revert: newStockQty = currentStockQty - originalDelta

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
            const delta = item.quantity; // This was added.

            // We want to remove it.
            const revertedQty = currentQty.sub(delta);

            revertItems.push({
              productId: item.productId,
              quantityRelative: delta.negated(), // Metadata for movement (opposite direction)
              quantityBefore: currentQty,
              quantityAfter: revertedQty, // Target stock quantity
            });
          }

          // We pass revertItems to applyInventoryMovements
          // Note: fallbackWapMap is needed but for revert it might just use current WAP if stock exists.
          await this.applyInventoryMovements(tx, doc, revertItems, fallbackWapMap);
        }

        // DRAFT -> CANCELLED: Allowed, no stock changes.
        // CANCELLED -> DRAFT: Allowed, no stock changes.

        return tx.documentAdjustment.update({
          where: { id },
          data: { status: newStatus },
          include: { items: true },
        });
      },
      {
        isolationLevel: 'Serializable',
      },
    );
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
      await this.stockMovementService.create(tx, {
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
      },
    });
  }
}
