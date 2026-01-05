import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../core/prisma/prisma.service';
import { InventoryService } from '../core/inventory/inventory.service';
import { CreateDocumentAdjustmentDto } from './dto/create-document-adjustment.dto';
import Decimal = Prisma.Decimal;

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
    const fallbackWapMap =
      await this.inventoryService.getFallbackWapMap(productIds);

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
            quantity,
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
                quantity: i.quantity,
                quantityBefore: i.quantityBefore,
                quantityAfter: i.quantityAfter,
              })),
            },
          },
          include: { items: true },
        });

        // 5. Update Stocks (Only if COMPLETED)
        if (targetStatus === 'COMPLETED') {
          for (const item of preparedItems) {
            const stock = stockMap.get(item.productId);

            let currentWap = new Decimal(0);

            if (stock) {
              currentWap = stock.averagePurchasePrice;
            } else {
              // Use fallback if no local stock
              currentWap = fallbackWapMap.get(item.productId) || new Decimal(0);
            }

            await tx.stock.upsert({
              where: {
                productId_storeId: { productId: item.productId, storeId },
              },
              create: {
                productId: item.productId,
                storeId,
                quantity: item.quantityAfter,
                averagePurchasePrice: currentWap,
              },
              update: {
                quantity: item.quantityAfter,
                // WAP usually doesn't change on qty adjustment
              },
            });

            // Fetch updated stock for accurate snapshot
            const updatedStock = await tx.stock.findUniqueOrThrow({
              where: {
                productId_storeId: { productId: item.productId, storeId },
              },
            });

            // Audit: Log Stock Movement
            await this.inventoryService.logStockMovement(tx, {
              type: 'ADJUSTMENT',
              storeId,
              productId: item.productId,
              quantity: item.quantity, // Delta
              date: doc.date,
              documentId: doc.id,
              quantityAfter: updatedStock.quantity,
              averagePurchasePrice: updatedStock.averagePurchasePrice,
            });
          }
        }

        return doc;
      },
      {
        isolationLevel: 'Serializable', // Guarantee quantityBefore/After consistency
      },
    );
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
