import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import { InventoryService } from '../core/inventory/inventory.service';
import { Prisma } from '../generated/prisma/client';
import { CreateDocumentSaleDto } from './dto/create-document-sale.dto';
import Decimal = Prisma.Decimal;

interface PreparedSaleItem {
  productId: string;
  quantity: Decimal;
  price: Decimal;
}

interface SaleMinimal {
  id?: string;
  storeId: string;
  date?: Date;
}

interface SaleWithItems extends SaleMinimal {
  items: { id: string; productId: string }[];
}

@Injectable()
export class DocumentSaleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
  ) {}

  async create(createDocumentSaleDto: CreateDocumentSaleDto) {
    const { storeId, cashboxId, clientId, date, status, priceTypeId, items } =
      createDocumentSaleDto;

    const targetStatus = status || 'COMPLETED';

    // 1. Validate Store
    await this.inventoryService.validateStore(storeId);

    // 2. Prepare Items (Fetch Products & Calculate Prices)
    const productIds = items.map((i) => i.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      include: { prices: true },
    });

    const productsMap = new Map(products.map((p) => [p.id, p]));
    const preparedItems: {
      productId: string;
      quantity: Decimal;
      price: Decimal;
      total: Decimal;
    }[] = [];
    let totalAmount = new Decimal(0);

    for (const item of items) {
      const product = productsMap.get(item.productId);
      if (!product) {
        throw new NotFoundException(`Product ${item.productId} not found`);
      }

      let finalPrice = new Decimal(item.price ?? 0);
      if (item.price === undefined) {
        if (priceTypeId) {
          const priceObj = product.prices.find((p) => p.priceTypeId === priceTypeId);
          finalPrice = priceObj ? priceObj.value : new Decimal(0);
        } else {
          // Default to first available price
          finalPrice = product.prices[0] ? product.prices[0].value : new Decimal(0);
        }
      }

      const quantity = new Decimal(item.quantity);
      const total = finalPrice.mul(quantity);
      totalAmount = totalAmount.add(total);

      preparedItems.push({
        productId: item.productId,
        quantity,
        price: finalPrice,
        total,
      });
    }

    // 3. Execute Transaction
    return this.prisma.$transaction(
      async (tx) => {
        // Fetch all relevant stocks in one go
        const stocks = await tx.stock.findMany({
          where: {
            storeId,
            productId: { in: productIds },
          },
        });
        const stockMap = new Map(stocks.map((s) => [s.productId, s]));

        const documentItemsData: {
          productId: string;
          quantity: Decimal;
          price: Decimal;
          costPrice: Decimal;
          total: Decimal;
        }[] = [];

        for (const item of preparedItems) {
          const stock = stockMap.get(item.productId);
          const currentQty = stock ? stock.quantity : new Decimal(0);
          const costPrice = stock ? stock.averagePurchasePrice : new Decimal(0);

          // Validate Stock Availability only if status is COMPLETED
          if (targetStatus === 'COMPLETED') {
            if (currentQty.lessThan(item.quantity)) {
              throw new BadRequestException(
                `Insufficient stock for product ${item.productId}. Available: ${currentQty.toString()}, Requested: ${item.quantity.toString()}`,
              );
            }
          }

          documentItemsData.push({
            productId: item.productId,
            quantity: item.quantity,
            price: item.price,
            costPrice,
            total: item.total,
          });
        }

        // Create DocumentSale
        const sale = await tx.documentSale.create({
          data: {
            storeId,
            cashboxId,
            clientId,
            date: date ? new Date(date) : new Date(),
            status: targetStatus,
            priceTypeId,
            totalAmount,
            items: {
              create: documentItemsData,
            },
          },
          include: { items: true },
        });

        // Update Stock if COMPLETED
        if (sale.status === 'COMPLETED') {
          await this.applyInventoryMovements(tx, sale, preparedItems);
        }

        return sale;
      },
      {
        isolationLevel: 'ReadCommitted',
      },
    );
  }

  async complete(id: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const sale = await tx.documentSale.findUniqueOrThrow({
          where: { id },
          include: { items: true },
        });

        if (sale.status !== 'DRAFT') {
          throw new BadRequestException('Only DRAFT documents can be completed');
        }

        const items = sale.items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          price: i.price,
        }));

        // 1. Update items with CURRENT cost price before completing
        await this.updateItemCostPrices(tx, sale);

        // 2. Apply stock movements
        await this.applyInventoryMovements(tx, sale, items);

        // 3. Update status
        return tx.documentSale.update({
          where: { id },
          data: { status: 'COMPLETED' },
          include: { items: true },
        });
      },
      {
        isolationLevel: 'Serializable', // Use stricter isolation for completion to avoid race conditions on stock
      },
    );
  }

  private async updateItemCostPrices(tx: Prisma.TransactionClient, sale: SaleWithItems) {
    const productIds = sale.items.map((i) => i.productId);
    const stocks = await tx.stock.findMany({
      where: {
        storeId: sale.storeId,
        productId: { in: productIds },
      },
    });
    const stockMap = new Map(stocks.map((s) => [s.productId, s]));

    for (const item of sale.items) {
      const stock = stockMap.get(item.productId);
      const costPrice = stock ? stock.averagePurchasePrice : new Decimal(0);

      await tx.documentSaleItem.update({
        where: { id: item.id },
        data: { costPrice },
      });
    }
  }

  private async applyInventoryMovements(
    tx: Prisma.TransactionClient,
    sale: SaleMinimal,
    items: PreparedSaleItem[],
  ) {
    const storeId = sale.storeId;

    for (const item of items) {
      // Use updateMany with constraint to ensure atomic consistency
      const result = await tx.stock.updateMany({
        where: {
          productId: item.productId,
          storeId: storeId,
          quantity: { gte: item.quantity },
        },
        data: {
          quantity: { decrement: item.quantity },
        },
      });

      if (result.count === 0) {
        const currentStock = await tx.stock.findUnique({
          where: {
            productId_storeId: { productId: item.productId, storeId },
          },
        });
        const available = currentStock ? currentStock.quantity : 0;

        throw new BadRequestException(
          `Insufficient stock for product ${item.productId}. Available: ${available.toString()}, Requested: ${item.quantity.toString()}`,
        );
      }

      // Fetch updated stock for accurate snapshot
      const updatedStock = await tx.stock.findUniqueOrThrow({
        where: {
          productId_storeId: { productId: item.productId, storeId },
        },
      });

      // Audit: Log Stock Movement
      await this.inventoryService.logStockMovement(tx, {
        type: 'SALE',
        storeId,
        productId: item.productId,
        quantity: item.quantity.negated(),
        date: sale.date ?? new Date(),
        documentId: sale.id ?? '',
        quantityAfter: updatedStock.quantity,
        averagePurchasePrice: updatedStock.averagePurchasePrice,
      });
    }
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
