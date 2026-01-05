import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import Decimal = Prisma.Decimal;
import { CreateDocumentSaleDto } from './dto/create-document-sale.dto';

@Injectable()
export class DocumentSaleService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createDocumentSaleDto: CreateDocumentSaleDto) {
    const { storeId, cashboxId, clientId, date, status, priceTypeId, items } =
      createDocumentSaleDto;

    // Validate Store & Cashbox
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
    });
    if (!store) throw new NotFoundException('Store not found');

    // 1. Prepare Data
    let totalAmount = new Decimal(0);
    const saleItems: {
      productId: string;
      quantity: number | Decimal;
      price: number | Decimal;
      costPrice: number | Decimal;
      total: number | Decimal;
    }[] = [];

    // Check products and prices
    for (const item of items) {
      const product = await this.prisma.product.findUnique({
        where: { id: item.productId },
        include: { prices: true },
      });
      if (!product)
        throw new NotFoundException(`Product ${item.productId} not found`);

      // Determine price
      let finalPrice: Decimal | number | undefined = item.price;
      if (finalPrice === undefined) {
        if (priceTypeId) {
          const priceObj = product.prices.find(
            (p) => p.priceTypeId === priceTypeId,
          );
          finalPrice = priceObj ? priceObj.value : new Decimal(0);
        } else {
          // Default to first available if no price type specified for sale
          const defaultPrice = product.prices[0];
          finalPrice = defaultPrice ? defaultPrice.value : new Decimal(0);
        }
      }

      const finalPriceDec = new Decimal(finalPrice);
      const total = finalPriceDec.mul(item.quantity);
      totalAmount = totalAmount.add(total);

      // We need costPrice from Stock (WAP)
      const stock = await this.prisma.stock.findUnique({
        where: { productId_storeId: { productId: item.productId, storeId } },
      });
      const costPrice = stock?.averagePurchasePrice
        ? new Decimal(stock.averagePurchasePrice)
        : new Decimal(0);

      saleItems.push({
        productId: item.productId,
        quantity: item.quantity,
        price: finalPriceDec,
        costPrice: costPrice, // Capture current cost
        total: total,
      });
    }

    // 2. Transaction
    return this.prisma.$transaction(async (tx) => {
      // Create DocumentSale
      const sale = await tx.documentSale.create({
        data: {
          storeId,
          cashboxId,
          clientId,
          date: date ? new Date(date) : new Date(),
          status: status ?? 'COMPLETED', // Default to COMPLETED for now if not specified
          priceTypeId,
          totalAmount,
          items: {
            create: saleItems.map((i) => ({
              productId: i.productId,
              quantity: i.quantity,
              price: i.price,
              costPrice: i.costPrice,
              total: i.total,
            })),
          },
        },
        include: { items: true },
      });

      // If completed, update Stock
      if (sale.status === 'COMPLETED') {
        for (const item of sale.items) {
          // Decrement Stock
          const currentStock = await tx.stock.findUnique({
            where: {
              productId_storeId: { productId: item.productId, storeId },
            },
          });

          const oldQty = currentStock?.quantity
            ? new Decimal(currentStock.quantity)
            : new Decimal(0);
          const newQty = oldQty.sub(item.quantity);

          await tx.stock.upsert({
            where: {
              productId_storeId: { productId: item.productId, storeId },
            },
            create: {
              productId: item.productId,
              storeId,
              quantity: new Decimal(item.quantity).neg(), // Negative stock possible if allowed
              averagePurchasePrice: 0,
            },
            update: {
              quantity: newQty,
            },
          });

          // Create Movement
        }
      }

      return sale;
    });
  }

  findAll(include?: Record<string, boolean>) {
    return this.prisma.documentSale.findMany({
      include,
      orderBy: { createdAt: 'desc' },
    });
  }

  findOne(id: string, include?: Record<string, boolean>) {
    return this.prisma.documentSale.findUniqueOrThrow({
      where: { id },
      include,
    });
  }
}
