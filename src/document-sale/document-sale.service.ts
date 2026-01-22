import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import { InventoryService } from '../core/inventory/inventory.service';
import { Prisma } from '../generated/prisma/client';
import { CreateDocumentSaleDto } from './dto/create-document-sale.dto';
import { StoreService } from '../store/store.service';
import { StockLedgerService } from '../stock-ledger/stock-ledger.service';
import { DocumentLedgerService } from '../document-ledger/document-ledger.service';
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
    private readonly stockLedgerService: StockLedgerService,
    private readonly ledgerService: DocumentLedgerService,
  ) {}

  async create(createDocumentSaleDto: CreateDocumentSaleDto) {
    const { storeId, cashboxId, clientId, date, status, priceTypeId, items, notes } =
      createDocumentSaleDto;

    const targetStatus = status || 'DRAFT';
    const safeItems = items || [];

    // 1. Validate Store
    await this.storeService.validateStore(storeId);

    // 2. Prepare Items (Fetch Products & Calculate Prices)
    const productIds = safeItems.map((i) => i.productId);
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
    let total = new Decimal(0);

    for (const item of safeItems) {
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
      const itemTotal = finalPrice.mul(quantity);
      total = total.add(itemTotal);

      preparedItems.push({
        productId: item.productId,
        quantity,
        price: finalPrice,
        total: itemTotal,
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

        // ACQUIRE LOCKS for all products involved in this sale
        // Sort IDs to avoid deadlocks
        const sortedProductIds = [...productIds].sort();
        for (const pid of sortedProductIds) {
          await this.inventoryService.lockProduct(tx, storeId, pid);
        }

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
            notes,
            total,
            items: {
              create: documentItemsData,
            },
          },
          include: { items: true },
        });

        // Update Stock if COMPLETED
        if (sale.status === 'COMPLETED' && preparedItems.length > 0) {
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

        // ACQUIRE LOCKS for all products involved
        const productIds = sale.items.map((i) => i.productId);
        const sortedProductIds = [...new Set(productIds)].sort(); // Unique and Sorted
        for (const pid of sortedProductIds) {
          await this.inventoryService.lockProduct(tx, sale.storeId, pid);
        }

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
        const updatedSale = await tx.documentSale.update({
          where: { id },
          data: { status: newStatus },
          include: { items: true },
        });

        await this.ledgerService.logAction(tx, {
          documentId: id,
          documentType: 'documentSale',
          action: 'STATUS_CHANGED',
          details: { from: oldStatus, to: newStatus },
        });

        return updatedSale;
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
      await this.stockLedgerService.create(tx, {
        type: 'SALE',
        storeId,
        productId: item.productId,
        quantity: item.quantity.negated(),
        date: sale.date ?? new Date(),
        documentId: sale.id ?? '',

        quantityBefore: updatedStock.quantity.add(item.quantity), // Derived as we fetched AFTER update
        quantityAfter: updatedStock.quantity,

        averagePurchasePrice: updatedStock.averagePurchasePrice,
        transactionAmount: item.quantity.mul(updatedStock.averagePurchasePrice).negated(), // COGS value

        batchId: sale.id,
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

        const { storeId, cashboxId, clientId, date, priceTypeId, items, notes } = updateDto;
        const safeItems = items || [];

        // 1. Prepare new Items
        const productIds = safeItems.map((i) => i.productId);

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
        let total = new Decimal(0);

        for (const item of safeItems) {
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
          const itemTotal = finalPrice.mul(quantity);
          total = total.add(itemTotal);

          preparedItems.push({
            productId: item.productId,
            quantity,
            price: finalPrice,
            total: itemTotal,
          });
        }

        // 2. Delete existing items
        await tx.documentSaleItem.deleteMany({
          where: { saleId: id },
        });

        // 3. Update Document
        const updatedSale = await tx.documentSale.update({
          where: { id },
          data: {
            storeId,
            cashboxId,
            clientId,
            date: date ? new Date(date) : new Date(),
            priceTypeId,
            notes,
            total,
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

        // Log Update (notes etc)
        const changes: Record<string, any> = {};
        if (notes !== undefined && notes !== (sale.notes ?? '')) {
          changes.notes = notes;
        }
        if (storeId !== sale.storeId) {
          changes.storeId = storeId;
        }
        if (clientId !== sale.clientId) {
          changes.clientId = clientId;
        }
        if (priceTypeId !== sale.priceTypeId) {
          changes.priceTypeId = priceTypeId;
        }
        if (date && new Date(date).getTime() !== sale.date?.getTime()) {
          changes.date = date;
        }

        if (Object.keys(changes).length > 0) {
          await this.ledgerService.logAction(tx, {
            documentId: id,
            documentType: 'documentSale',
            action: 'UPDATED',
            details: changes,
          });
        }

        // Log Diffs
        // Assuming oldItems and preparedItems are available for diffing
        // This part of the snippet seems to be missing context for `oldItems`
        // For now, I'll assume `oldItems` would be derived from `sale.items` before deletion.
        // If `oldItems` is not defined, this will cause a compilation error.
        // For the purpose of this edit, I'll include it as provided, assuming `oldItems` is defined elsewhere.
        const oldItems = sale.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          price: item.price,
        }));

        await this.ledgerService.logDiff(
          tx,
          {
            documentId: id,
            documentType: 'documentSale',
          },
          oldItems,
          preparedItems,
          ['quantity', 'price'],
        );

        return updatedSale;
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
        documentLedger: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }
}
