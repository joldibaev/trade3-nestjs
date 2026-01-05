import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import { InventoryService } from '../core/inventory/inventory.service';
import { Prisma } from '../generated/prisma/client';
import { CreateDocumentReturnDto } from './dto/create-document-return.dto';
import Decimal = Prisma.Decimal;

@Injectable()
export class DocumentReturnService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
  ) {}

  async create(createDocumentReturnDto: CreateDocumentReturnDto) {
    const { storeId, clientId, date, status, items } = createDocumentReturnDto;

    const targetStatus = status || 'COMPLETED';

    // 1. Validate Store
    await this.inventoryService.validateStore(storeId);

    // 2. Prepare Items
    const productIds = items.map((i) => i.productId);

    // Fetch fallback WAPs for all products in one go
    const wapMap = await this.inventoryService.getFallbackWapMap(productIds);

    // Calculate totals & Prepare items
    let totalAmount = new Decimal(0);
    const returnItems = items.map((item) => {
      // Default price to 0 if not provided
      const price = new Decimal(item.price || 0);
      const quantity = new Decimal(item.quantity);
      const total = quantity.mul(price);
      totalAmount = totalAmount.add(total);

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

    return this.prisma.$transaction(
      async (tx) => {
        const doc = await tx.documentReturn.create({
          data: {
            storeId,
            clientId,
            date: date ? new Date(date) : new Date(),
            status: targetStatus,
            totalAmount,
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

        if (doc.status === 'COMPLETED') {
          for (const item of returnItems) {
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
            await this.inventoryService.logStockMovement(tx, {
              type: 'RETURN',
              storeId,
              productId: item.productId,
              quantity: item.quantity,
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

  findOne(id: string, include?: Record<string, boolean>) {
    return this.prisma.documentReturn.findUniqueOrThrow({
      where: { id },
      include,
    });
  }
}
