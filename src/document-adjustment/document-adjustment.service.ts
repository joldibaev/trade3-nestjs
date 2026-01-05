import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../core/prisma/prisma.service';
import { InventoryService } from '../core/inventory/inventory.service';
import { CreateDocumentAdjustmentDto } from './dto/create-document-adjustment.dto';
import Decimal = Prisma.Decimal;

interface PreparedAdjustmentItem {
  productId: string;
  quantityRelative: Decimal;
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
  ) {}

  async create(createDocumentAdjustmentDto: CreateDocumentAdjustmentDto) {
    const { storeId, date, status, items } = createDocumentAdjustmentDto;

    const targetStatus = status || 'COMPLETED';

    // 1. Validate Store
    await this.inventoryService.validateStore(storeId);

    // Prepare IDs
    const productIds = items.map((i) => i.productId);

    // 1a. Pre-fetch Fallback WAPs (checking other stores)
    // We do this outside the transaction for simplicity, as it's just a fallback hint
    const fallbackWapMap = await this.inventoryService.getFallbackWapMap(productIds);

    return this.prisma.$transaction(
      async (tx) => {
        // 2. Batch Fetch Existing Stocks (Current Store) - MUST be inside TX
        const existingStocks = await tx.stock.findMany({
          where: {
            storeId,
            productId: { in: productIds },
          },
        });
        const stockMap = new Map(existingStocks.map((s) => [s.productId, s]));

        // 3. Prepare Items Data (Calculate Before/After)
        const preparedItems = items.map((item) => {
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

        // 4. Create Document with Items
        const doc = await tx.documentAdjustment.create({
          data: {
            storeId,
            date: date ? new Date(date) : new Date(),
            status: targetStatus,
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
        if (targetStatus === 'COMPLETED') {
          await this.applyInventoryMovements(tx, doc, preparedItems, fallbackWapMap);
        }

        return doc;
      },
      {
        isolationLevel: 'Serializable', // Guarantee quantityBefore/After consistency
      },
    );
  }

  async complete(id: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const doc = await tx.documentAdjustment.findUniqueOrThrow({
          where: { id },
          include: { items: true },
        });

        if (doc.status !== 'DRAFT') {
          throw new Error('Only DRAFT documents can be completed');
        }

        const productIds = doc.items.map((i) => i.productId);
        const fallbackWapMap = await this.inventoryService.getFallbackWapMap(productIds);
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

          // Update snapshots in the item
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
            quantityAfter: newQty,
          });
        }

        await this.applyInventoryMovements(tx, doc, preparedItems, fallbackWapMap);

        return tx.documentAdjustment.update({
          where: { id },
          data: { status: 'COMPLETED' },
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
      await this.inventoryService.logStockMovement(tx, {
        type: 'ADJUSTMENT',
        storeId,
        productId: item.productId,
        quantity: qDelta,
        date: doc.date ?? new Date(),
        documentId: doc.id ?? '',
        quantityAfter: qAfter,
        averagePurchasePrice: currentWap,
      });
    }
  }

  findAll(include?: Record<string, boolean>) {
    return this.prisma.documentAdjustment.findMany({
      include,
      orderBy: { createdAt: 'desc' },
    });
  }

  findOne(id: string, include?: Record<string, boolean>) {
    return this.prisma.documentAdjustment.findUniqueOrThrow({
      where: { id },
      include,
    });
  }
}
