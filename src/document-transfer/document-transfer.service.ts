import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import Decimal = Prisma.Decimal;
import { CreateDocumentTransferDto } from './dto/create-document-transfer.dto';

@Injectable()
export class DocumentTransferService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createDocumentTransferDto: CreateDocumentTransferDto) {
    const { sourceStoreId, destinationStoreId, date, status, items } =
      createDocumentTransferDto;

    if (sourceStoreId === destinationStoreId) {
      throw new BadRequestException(
        'Source and Destination stores must be different',
      );
    }

    const sourceStore = await this.prisma.store.findUnique({
      where: { id: sourceStoreId },
    });
    if (!sourceStore) throw new NotFoundException('Source Store not found');

    const destStore = await this.prisma.store.findUnique({
      where: { id: destinationStoreId },
    });
    if (!destStore) throw new NotFoundException('Destination Store not found');

    const transferItems = items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
    }));

    return this.prisma.$transaction(async (tx) => {
      const doc = await tx.documentTransfer.create({
        data: {
          sourceStoreId,
          destinationStoreId,
          date: date ? new Date(date) : new Date(),
          status: status ?? 'COMPLETED',
          items: {
            create: transferItems,
          },
        },
        include: { items: true },
      });

      if (doc.status === 'COMPLETED') {
        for (const item of doc.items) {
          // 1. Decrease Source Stock
          const sourceStock = await tx.stock.findUnique({
            where: {
              productId_storeId: {
                productId: item.productId,
                storeId: sourceStoreId,
              },
            },
          });
          const oldSourceQty = sourceStock?.quantity
            ? new Decimal(sourceStock.quantity)
            : new Decimal(0);
          const newSourceQty = oldSourceQty.sub(item.quantity);

          await tx.stock.upsert({
            where: {
              productId_storeId: {
                productId: item.productId,
                storeId: sourceStoreId,
              },
            },
            create: {
              productId: item.productId,
              storeId: sourceStoreId,
              quantity: new Decimal(item.quantity).neg(), // Negative allowed
              averagePurchasePrice: 0,
            },
            update: { quantity: newSourceQty },
          });

          // 2. Increase Destination Stock
          const destStock = await tx.stock.findUnique({
            where: {
              productId_storeId: {
                productId: item.productId,
                storeId: destinationStoreId,
              },
            },
          });
          const oldDestQty = destStock?.quantity
            ? new Decimal(destStock.quantity)
            : new Decimal(0);
          const newDestQty = oldDestQty.add(item.quantity);

          // Note: Transferring assumes cost price moves too?
          // If we had cost price logic, we'd take WAP from source and move it to dest.
          // For simplicity, we keep dest WAP same or simple Inc.

          let destWap = destStock?.averagePurchasePrice
            ? new Decimal(destStock.averagePurchasePrice)
            : new Decimal(0);
          const sourceWap = sourceStock?.averagePurchasePrice
            ? new Decimal(sourceStock.averagePurchasePrice)
            : new Decimal(0);

          if (!newDestQty.isZero()) {
            const oldVal = oldDestQty.mul(destWap);
            const transferVal = new Decimal(item.quantity).mul(sourceWap);
            destWap = oldVal.add(transferVal).div(newDestQty);
          }

          await tx.stock.upsert({
            where: {
              productId_storeId: {
                productId: item.productId,
                storeId: destinationStoreId,
              },
            },
            create: {
              productId: item.productId,
              storeId: destinationStoreId,
              quantity: item.quantity,
              averagePurchasePrice: sourceWap, // Assume initial price from source
            },
            update: {
              quantity: newDestQty,
              averagePurchasePrice: destWap,
            },
          });
        }
      }

      return doc;
    });
  }

  findAll(include?: Record<string, boolean>) {
    return this.prisma.documentTransfer.findMany({
      include,
      orderBy: { createdAt: 'desc' },
    });
  }

  findOne(id: string, include?: Record<string, boolean>) {
    return this.prisma.documentTransfer.findUniqueOrThrow({
      where: { id },
      include,
    });
  }
}
