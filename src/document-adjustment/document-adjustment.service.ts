import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import Decimal = Prisma.Decimal;
import { PrismaService } from '../core/prisma/prisma.service';
import { CreateDocumentAdjustmentDto } from './dto/create-document-adjustment.dto';

@Injectable()
export class DocumentAdjustmentService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createDocumentAdjustmentDto: CreateDocumentAdjustmentDto) {
    const { storeId, date, status, items } = createDocumentAdjustmentDto;

    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
    });
    if (!store) throw new NotFoundException('Store not found');

    const adjustmentItems = items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
    }));

    return this.prisma.$transaction(async (tx) => {
      const doc = await tx.documentAdjustment.create({
        data: {
          storeId,
          date: date ? new Date(date) : new Date(),
          status: status ?? 'COMPLETED',
          items: {
            create: adjustmentItems,
          },
        },
        include: { items: true },
      });

      if (doc.status === 'COMPLETED') {
        for (const item of doc.items) {
          // Update Stock
          const stock = await tx.stock.findUnique({
            where: {
              productId_storeId: { productId: item.productId, storeId },
            },
          });

          const oldQty = stock?.quantity
            ? new Decimal(stock.quantity)
            : new Decimal(0);
          const newQty = oldQty.add(item.quantity);

          await tx.stock.upsert({
            where: {
              productId_storeId: { productId: item.productId, storeId },
            },
            create: {
              productId: item.productId,
              storeId,
              quantity: newQty,
              averagePurchasePrice: 0,
            },
            update: {
              quantity: newQty,
            },
          });

          // Record quantities on the item
          await tx.documentAdjustmentItem.update({
            where: { id: item.id },
            data: {
              quantityBefore: oldQty,
              quantityAfter: newQty,
            },
          });
        }
      }

      return tx.documentAdjustment.findUnique({
        where: { id: doc.id },
        include: { items: true },
      });
    });
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
