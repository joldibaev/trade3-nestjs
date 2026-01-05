import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import Decimal = Prisma.Decimal;
import { CreateDocumentPurchaseDto } from './dto/create-document-purchase.dto';

@Injectable()
export class DocumentPurchaseService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createDocumentPurchaseDto: CreateDocumentPurchaseDto) {
    const { storeId, vendorId, date, status, items } =
      createDocumentPurchaseDto;

    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
    });
    if (!store) throw new NotFoundException('Store not found');

    // Calculate totals
    let totalAmount = 0;
    const purchaseItems = items.map((item) => {
      const total = item.quantity * item.price;
      totalAmount += total;
      return {
        productId: item.productId,
        quantity: item.quantity,
        price: item.price,
        total,
      };
    });

    return this.prisma.$transaction(async (tx) => {
      // 1. Create DocumentPurchase
      const purchase = await tx.documentPurchase.create({
        data: {
          storeId,
          vendorId,
          date: date ? new Date(date) : new Date(),
          status: status ?? 'COMPLETED',
          totalAmount,
          items: {
            create: purchaseItems,
          },
        },
        include: { items: true },
      });

      // 2. Update Stock if completed
      if (purchase.status === 'COMPLETED') {
        for (const item of purchase.items) {
          const stock = await tx.stock.findUnique({
            where: {
              productId_storeId: { productId: item.productId, storeId },
            },
          });

          const oldQty = stock?.quantity
            ? new Decimal(stock.quantity)
            : new Decimal(0);
          const oldRate = stock?.averagePurchasePrice
            ? new Decimal(stock.averagePurchasePrice)
            : new Decimal(0);
          const newQty = oldQty.add(item.quantity);

          // Calculate WAP
          const oldVal = oldQty.mul(oldRate);
          const newVal = oldVal.add(item.total);
          const newRate = !newQty.isZero()
            ? newVal.div(newQty)
            : new Decimal(0);

          await tx.stock.upsert({
            where: {
              productId_storeId: { productId: item.productId, storeId },
            },
            create: {
              productId: item.productId,
              storeId,
              quantity: newQty,
              averagePurchasePrice: newRate,
            },
            update: {
              quantity: newQty,
              averagePurchasePrice: newRate,
            },
          });

          // Create Movement
        }
      }

      return purchase;
    });
  }

  findAll(include?: Record<string, boolean>) {
    return this.prisma.documentPurchase.findMany({
      include,
      orderBy: { createdAt: 'desc' },
    });
  }

  findOne(id: string, include?: Record<string, boolean>) {
    return this.prisma.documentPurchase.findUniqueOrThrow({
      where: { id },
      include,
    });
  }
}
