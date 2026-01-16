import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import { InventoryService } from '../core/inventory/inventory.service';
import { Prisma } from '../generated/prisma/client';
import { CreateDocumentSaleDto } from './dto/create-document-sale.dto';
import { StoreService } from '../store/store.service';
import { StockMovementService } from '../stock-movement/stock-movement.service';
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
    private readonly storeService: StoreService,
    private readonly stockMovementService: StockMovementService,
  ) {}

  async create(createDocumentSaleDto: CreateDocumentSaleDto) {
    const { storeId, cashboxId, clientId, date, status, priceTypeId, items } =
      createDocumentSaleDto;

    const targetStatus = status || 'COMPLETED';

    // 1. Validate Store
    await this.storeService.validateStore(storeId);

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
        throw new NotFoundException(`Товар ${item.productId} не найден`);
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
                `Недостаточно остатка для товара ${item.productId}. Доступно: ${currentQty.toString()}, Запрошено: ${item.quantity.toString()}`,
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

  async updateStatus(id: string, newStatus: 'DRAFT' | 'COMPLETED' | 'CANCELLED') {
    return this.prisma.$transaction(
      async (tx) => {
        const sale = await tx.documentSale.findUniqueOrThrow({
          where: { id },
          include: { items: true },
        });

        const oldStatus = sale.status;

        if (oldStatus === newStatus) {
          return sale;
        }

        if (oldStatus === 'CANCELLED') {
          throw new BadRequestException('Нельзя изменить статус отмененного документа');
        }

        const items = sale.items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          price: i.price,
        }));

        // DRAFT -> COMPLETED
        if (oldStatus === 'DRAFT' && newStatus === 'COMPLETED') {
          // 1. Update items with CURRENT cost price before completing
          await this.updateItemCostPrices(tx, sale);

          // 2. Apply stock movements (Decrease Stock)
          await this.applyInventoryMovements(tx, sale, items);
        }

        // COMPLETED -> DRAFT (or CANCELLED)
        if (oldStatus === 'COMPLETED' && (newStatus === 'DRAFT' || newStatus === 'CANCELLED')) {
          // Revert stock (Increase Stock)
          // We pass negative quantity to applyInventoryMovements.
          // Since it does `decrement: qty`, decrementing a negative number = increment.
          const revertItems = items.map((i) => ({
            ...i,
            quantity: i.quantity.negated(),
          }));

          await this.applyInventoryMovements(tx, sale, revertItems);
        }

        // Update status
        return tx.documentSale.update({
          where: { id },
          data: { status: newStatus },
          include: { items: true },
        });
      },
      {
        isolationLevel: 'Serializable',
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
          `Недостаточно остатка для товара ${item.productId}. Доступно: ${available.toString()}, Запрошено: ${item.quantity.toString()}`,
        );
      }

      // Fetch updated stock for accurate snapshot
      const updatedStock = await tx.stock.findUniqueOrThrow({
        where: {
          productId_storeId: { productId: item.productId, storeId },
        },
      });

      // Audit: Log Stock Movement
      await this.stockMovementService.create(tx, {
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

  async update(id: string, updateDto: CreateDocumentSaleDto) {
    return this.prisma.$transaction(
      async (tx) => {
        const sale = await tx.documentSale.findUniqueOrThrow({
          where: { id },
          include: { items: true },
        });

        if (sale.status !== 'DRAFT') {
          throw new BadRequestException('Только черновики могут быть изменены');
        }

        const { storeId, cashboxId, clientId, date, priceTypeId, items } = updateDto;

        // 1. Prepare new Items
        const productIds = items.map((i) => i.productId);

        const products = await tx.product.findMany({
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
            throw new NotFoundException(`Товар ${item.productId} не найден`);
          }

          let finalPrice = new Decimal(item.price ?? 0);
          if (item.price === undefined) {
            if (priceTypeId) {
              const priceObj = product.prices.find((p) => p.priceTypeId === priceTypeId);
              finalPrice = priceObj ? priceObj.value : new Decimal(0);
            } else {
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

        // 2. Delete existing items
        await tx.documentSaleItem.deleteMany({
          where: { saleId: id },
        });

        // 3. Update Document
        return tx.documentSale.update({
          where: { id },
          data: {
            storeId,
            cashboxId,
            clientId,
            date: date ? new Date(date) : new Date(),
            priceTypeId,
            totalAmount,
            items: {
              create: preparedItems.map((i) => ({
                productId: i.productId,
                quantity: i.quantity,
                price: i.price,
                total: i.total,
              })),
            },
          },
          include: { items: true },
        });
      },
      {
        isolationLevel: 'ReadCommitted',
      },
    );
  }

  async remove(id: string) {
    return this.prisma.$transaction(async (tx) => {
      const sale = await tx.documentSale.findUniqueOrThrow({
        where: { id },
      });

      if (sale.status !== 'DRAFT') {
        throw new BadRequestException('Только черновики могут быть удалены');
      }

      await tx.documentSaleItem.deleteMany({
        where: { saleId: id },
      });

      return tx.documentSale.delete({
        where: { id },
      });
    });
  }

  findAll() {
    return this.prisma.documentSale.findMany({
      include: { store: true, client: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  findOne(id: string) {
    return this.prisma.documentSale.findUniqueOrThrow({
      where: { id },
      include: {
        items: true,
        client: true,
        store: true,
        cashbox: true,
        priceType: true,
      },
    });
  }
}
