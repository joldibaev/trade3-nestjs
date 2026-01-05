import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
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

      saleItems.push({
        productId: item.productId,
        quantity: item.quantity,
        price: finalPriceDec,
        total: total,
      });
    }

    // 2. Transaction with Serializable isolation to prevent race conditions
    return this.prisma.$transaction(
      async (tx) => {
        // Check stock availability BEFORE creating the sale document
        // This prevents race conditions in concurrent sales
        const saleItemsWithCostPrice: {
          productId: string;
          quantity: number | Decimal;
          price: number | Decimal;
          costPrice: Decimal;
          total: number | Decimal;
        }[] = [];
        const stockData = new Map<
          string,
          {
            availableQty: Decimal;
            costPrice: Decimal;
            averagePurchasePrice: Decimal;
          }
        >();

        for (const item of saleItems) {
          const currentStock = await tx.stock.findUnique({
            where: {
              productId_storeId: { productId: item.productId, storeId },
            },
          });

          const availableQty = currentStock?.quantity
            ? new Decimal(currentStock.quantity)
            : new Decimal(0);
          const requestedQty = new Decimal(item.quantity);

          // Validate sufficient stock BEFORE creating sale document
          if (availableQty.lessThan(requestedQty)) {
            throw new BadRequestException(
              `Insufficient stock for product ${item.productId}. Available: ${availableQty.toString()}, Requested: ${requestedQty.toString()}`,
            );
          }

          // Get cost price from stock
          const costPrice = currentStock?.averagePurchasePrice
            ? new Decimal(currentStock.averagePurchasePrice)
            : new Decimal(0);

          // Store stock data for later use
          stockData.set(item.productId, {
            availableQty,
            costPrice,
            averagePurchasePrice:
              currentStock?.averagePurchasePrice || new Decimal(0),
          });

          saleItemsWithCostPrice.push({
            ...item,
            costPrice,
          });
        }

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
              create: saleItemsWithCostPrice.map((i) => ({
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
            // Re-read stock within transaction to ensure we have the latest value
            // This prevents race conditions when multiple transactions run concurrently
            const currentStock = await tx.stock.findUnique({
              where: {
                productId_storeId: { productId: item.productId, storeId },
              },
            });

            const availableQty = currentStock?.quantity
              ? new Decimal(currentStock.quantity)
              : new Decimal(0);
            const requestedQty = new Decimal(item.quantity);

            // Validate again before updating (double-check within transaction)
            if (availableQty.lessThan(requestedQty)) {
              throw new BadRequestException(
                `Insufficient stock for product ${item.productId}. Available: ${availableQty.toString()}, Requested: ${requestedQty.toString()}`,
              );
            }

            // Decrement Stock
            const newQty = availableQty.sub(requestedQty);
            const stockInfo = stockData.get(item.productId);

            await tx.stock.upsert({
              where: {
                productId_storeId: { productId: item.productId, storeId },
              },
              create: {
                productId: item.productId,
                storeId,
                quantity: newQty,
                averagePurchasePrice:
                  stockInfo?.averagePurchasePrice || new Decimal(0),
              },
              update: {
                quantity: newQty,
              },
            });

            // Create Movement
          }
        }

        return sale;
      },
      {
        isolationLevel: 'Serializable',
      },
    );
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
