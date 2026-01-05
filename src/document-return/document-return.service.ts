import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import Decimal = Prisma.Decimal;
import { CreateDocumentReturnDto } from './dto/create-document-return.dto';

@Injectable()
export class DocumentReturnService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createDocumentReturnDto: CreateDocumentReturnDto) {
    const { storeId, clientId, date, status, items } = createDocumentReturnDto;

    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
    });
    if (!store) throw new NotFoundException('Store not found');

    // Calculate totals
    let totalAmount = 0;
    const returnItems = items.map((item) => {
      // Default price to 0 if not provided
      const price = item.price || 0;
      const total = item.quantity * price;
      totalAmount += total;
      return {
        productId: item.productId,
        quantity: item.quantity,
        price,
        total,
      };
    });

    return this.prisma.$transaction(async (tx) => {
      const doc = await tx.documentReturn.create({
        data: {
          storeId,
          clientId,
          date: date ? new Date(date) : new Date(),
          status: status ?? 'COMPLETED',
          totalAmount,
          items: {
            create: returnItems,
          },
        },
        include: { items: true },
      });

      if (doc.status === 'COMPLETED') {
        for (const item of doc.items) {
          // Increase Stock
          const stock = await tx.stock.findUnique({
            where: {
              productId_storeId: { productId: item.productId, storeId },
            },
          });

          // Logic: Just increase Qty. WAP remains same? Or re-average?
          // If we don't know cost price, keep WAP same.
          // If we treat return as "IN", we typically need cost price.
          // For now, simple increment.
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
        }
      }

      return doc;
    });
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
