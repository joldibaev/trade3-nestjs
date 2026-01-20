import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import { InventoryService } from '../core/inventory/inventory.service';
import { Prisma } from '../generated/prisma/client';
import { CreateDocumentPurchaseDto } from './dto/create-document-purchase.dto';
import { UpdateDocumentPurchaseDto } from './dto/update-document-purchase.dto';
import { StoreService } from '../store/store.service';
import { StockMovementService } from '../stock-movement/stock-movement.service';
import Decimal = Prisma.Decimal;

interface PreparedPurchaseItem {
  productId: string;
  quantity: Decimal;
  price: Decimal;
  total: Decimal;
  newPrices?: PriceUpdate[];
}

interface PriceUpdate {
  priceTypeId: string;
  value: number;
}

interface PurchaseContext {
  id?: string;
  storeId: string;
  date?: Date;
}

@Injectable()
export class DocumentPurchaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly storeService: StoreService,
    private readonly stockMovementService: StockMovementService,
  ) { }

  async create(createDocumentPurchaseDto: CreateDocumentPurchaseDto) {
    const { storeId, vendorId, date, items, status, notes } = createDocumentPurchaseDto;

    const targetStatus = status || 'DRAFT';
    const safeItems = items || [];

    // 1. Validate Store
    await this.storeService.validateStore(storeId);

    // 2. Execute Transaction
    return this.prisma.$transaction(
      async (tx) => {
        let preparedItems: PreparedPurchaseItem[] = [];
        let total = new Decimal(0);

        if (safeItems.length > 0) {
          const productIds = safeItems.map((i) => i.productId);
          // Validate products exist
          const productsCount = await tx.product.count({
            where: { id: { in: productIds } },
          });
          if (productsCount !== productIds.length) {
            throw new BadRequestException('Некоторые товары не найдены');
          }

          preparedItems = safeItems.map((item) => {
            const quantity = new Decimal(item.quantity);
            const price = new Decimal(item.price);
            const lineTotal = quantity.mul(price);
            total = total.add(lineTotal);

            return {
              productId: item.productId,
              quantity,
              price,
              total: lineTotal,
              newPrices: item.newPrices,
            };
          });
        }

        // Create DocumentPurchase
        // Create DocumentPurchase
        const doc = await tx.documentPurchase.create({
          data: {
            storeId,
            vendorId,
            date: new Date(date),
            status: targetStatus,
            notes,
            total,
            items: {
              create: preparedItems.map((i) => ({
                productId: i.productId,
                quantity: i.quantity,
                price: i.price,
                total: i.total,
                newPrices: {
                  create:
                    i.newPrices?.map((np) => ({
                      priceTypeId: np.priceTypeId,
                      value: new Decimal(np.value),
                    })) || [],
                },
              })),
            },
          },
          include: { items: true },
        });

        // 3. Apply Inventory Movements (Only if COMPLETED)
        if (targetStatus === 'COMPLETED' && preparedItems.length > 0) {
          // Re-map items to simple format expected by private method if needed
          // Actually applyInventoryMovements expects PreparedPurchaseItem[] which we have
          await this.applyInventoryMovements(tx, doc, preparedItems);

          // 4. Apply Pending Price Updates
          // We need items with newPrices here. `doc.items` doesn't include newPrices unless we include it in create return
          // But `preparedItems` has `newPrices`.
          // `applyDelayedProductPriceUpdates` expects Prisma payload.
          // Let's refactor applyDelayedProductPriceUpdates or manually construct payload.
          // Or just fetch the doc again? No, unused overhead.
          // The method takes `Prisma.DocumentPurchaseItemGetPayload...`
          // We can construct it or just refactor helper.
          // Let's fetch the doc with newPrices to be safe and type-compliant.
          const createdDoc = await tx.documentPurchase.findUniqueOrThrow({
            where: { id: doc.id },
            include: { items: { include: { newPrices: true } } },
          });
          await this.applyDelayedProductPriceUpdates(tx, doc.id, createdDoc.items);
        }

        return doc;
      },
      {
        isolationLevel: 'Serializable',
      },
    );
  }

  async updateStatus(id: string, newStatus: 'DRAFT' | 'COMPLETED' | 'CANCELLED') {
    let itemsToReprocess: { productId: string; date: Date }[] = [];

    const updatedPurchase = await this.prisma.$transaction(
      async (tx) => {
        const purchase = await tx.documentPurchase.findUniqueOrThrow({
          where: { id },
          include: {
            items: {
              include: { newPrices: true },
            },
          },
        });

        const oldStatus = purchase.status;

        if (oldStatus === newStatus) {
          return purchase;
        }

        // Prevent modifying CANCELLED documents (unless business logic allows revival, but usually not)
        if (oldStatus === 'CANCELLED') {
          throw new BadRequestException('Нельзя изменить статус отмененного документа');
        }

        // Prepare items
        const items = purchase.items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          price: i.price,
          total: i.total,
          newPrices: [],
        }));

        // DRAFT -> COMPLETED
        if (oldStatus === 'DRAFT' && newStatus === 'COMPLETED') {
          // 1. Apply Inventory Movements
          await this.applyInventoryMovements(tx, purchase, items);

          // 2. Apply Pending Price Updates
          await this.applyDelayedProductPriceUpdates(tx, purchase.id, purchase.items);
        }

        // COMPLETED -> DRAFT (or CANCELLED)
        // Revert the purchase (decrease stock)
        if (oldStatus === 'COMPLETED' && (newStatus === 'DRAFT' || newStatus === 'CANCELLED')) {
          // Check for negative stock before reverting
          await this.validateStockForRevert(tx, purchase.storeId, items);

          // Apply revert (negative quantity)
          const revertItems = items.map((i) => ({
            ...i,
            quantity: i.quantity.negated(),
            total: i.total.negated(),
          }));

          await this.applyInventoryMovements(tx, purchase, revertItems);

          // COLLECT ITEMS FOR REPROCESSING
          // We must reprocess starting from the date of the purchase
          // Note: InventoryService will pick up the new "Revert" movement (created above with purchase.date)
          // and re-calculate everything chronologically.
          itemsToReprocess = purchase.items.map((item) => ({
            productId: item.productId,
            date: purchase.date,
          }));
        }

        // Update status
        return tx.documentPurchase.update({
          where: { id },
          data: { status: newStatus },
          include: { items: true },
        });
      },
      {
        isolationLevel: 'Serializable',
      },
    );

    // POST-TRANSACTION: Reprocess History
    // We do this outside the transaction to avoid locking and to use a fresh client
    if (itemsToReprocess.length > 0) {
      for (const item of itemsToReprocess) {
        await this.inventoryService.reprocessProductHistory(
          updatedPurchase.storeId,
          item.productId,
          item.date,
        );
      }
    }

    return updatedPurchase;
  }

  private async validateStockForRevert(
    tx: Prisma.TransactionClient,
    storeId: string,
    items: PreparedPurchaseItem[],
  ) {
    const productIds = items.map((i) => i.productId);
    const stocks = await tx.stock.findMany({
      where: { storeId, productId: { in: productIds } },
    });
    const stockMap = new Map(stocks.map((s) => [s.productId, s]));

    for (const item of items) {
      const currentQty = stockMap.get(item.productId)?.quantity || new Decimal(0);
      const currentWap = stockMap.get(item.productId)?.averagePurchasePrice || new Decimal(0);

      // 1. Quantity Check
      if (currentQty.lessThan(item.quantity)) {
        throw new BadRequestException(
          `Недостаточно остатка товара ${item.productId} для отмены закупки`,
        );
      }

      // 2. Financial Check (prevent negative WAP)
      // Current Value = 100 * 55 = 5500
      // Revert Value = 100 * 100 = 10000
      // Result = -4500 (Invalid)
      const currentTotalValue = currentQty.mul(currentWap);
      const revertTotalValue = item.quantity.mul(item.price);

      if (currentTotalValue.lessThan(revertTotalValue)) {
        throw new BadRequestException(
          `Нельзя отменить закупку товара ${item.productId}: остаточная стоимость станет отрицательной. Используйте Корректировку или Возврат.`,
        );
      }
    }
  }

  private async applyInventoryMovements(
    tx: Prisma.TransactionClient,
    purchase: PurchaseContext,
    items: PreparedPurchaseItem[],
  ) {
    const storeId = purchase.storeId;
    const productIds = items.map((i) => i.productId);

    // Fetch existing stocks in batch
    const existingStocks = await tx.stock.findMany({
      where: {
        storeId,
        productId: { in: productIds },
      },
    });
    const stockMap = new Map<string, (typeof existingStocks)[0]>(
      existingStocks.map((s) => [s.productId, s]),
    );

    // Process stock updates strictly sequentially
    for (const item of items) {
      const stock = stockMap.get(item.productId);

      const oldQty = stock ? stock.quantity : new Decimal(0);
      const oldWap = stock ? stock.averagePurchasePrice : new Decimal(0);

      // Calculate new Quantity
      const newQty = oldQty.add(item.quantity);

      // Calculate WAP using helper
      const newWap = this.inventoryService.calculateNewWap(
        oldQty,
        oldWap,
        item.quantity,
        item.price,
      );

      await tx.stock.upsert({
        where: {
          productId_storeId: { productId: item.productId, storeId },
        },
        create: {
          productId: item.productId,
          storeId,
          quantity: newQty,
          averagePurchasePrice: newWap,
        },
        update: {
          quantity: newQty,
          averagePurchasePrice: newWap,
        },
      });

      // Audit: Log Stock Movement
      await this.stockMovementService.create(tx, {
        type: 'PURCHASE',
        storeId,
        productId: item.productId,
        quantity: item.quantity,
        date: purchase.date ?? new Date(),
        documentId: purchase.id ?? '',

        quantityBefore: oldQty,
        quantityAfter: newQty,

        averagePurchasePrice: newWap,
        transactionAmount: item.total, // Total for this item line in purchase is qty * price

        batchId: purchase.id,
        // userId: TODO: pass from context
      });
    }
  }

  async update(id: string, updateDto: UpdateDocumentPurchaseDto) {
    return this.prisma.$transaction(
      async (tx) => {
        const doc = await tx.documentPurchase.findUniqueOrThrow({
          where: { id },
          include: { items: true },
        });

        if (doc.status !== 'DRAFT') {
          throw new BadRequestException('Только черновики могут быть изменены');
        }

        const { storeId, vendorId, date, items, notes } = updateDto;
        const safeItems = items || [];

        // 1. Prepare new Items
        const productIds = safeItems.map((i) => i.productId);

        // Validate products exist (Optional but good practice)
        const productsCount = await tx.product.count({
          where: { id: { in: productIds } },
        });
        if (productsCount !== productIds.length) {
          throw new BadRequestException('Некоторые товары не найдены');
        }

        const preparedItems = safeItems.map((item) => {
          const quantity = new Decimal(item.quantity);
          const price = new Decimal(item.price);
          return {
            productId: item.productId,
            quantity,
            price,
            total: quantity.mul(price),
            newPrices: item.newPrices,
          };
        });

        const total = preparedItems.reduce((sum, item) => sum.add(item.total), new Decimal(0));

        // Apply Price Updates Immediately - REVERTED per user request
        // await this.applyProductPriceUpdates(tx, preparedItems);

        // 2. Delete existing items
        await tx.documentPurchaseItem.deleteMany({
          where: { purchaseId: id },
        });

        // 3. Update Document
        return tx.documentPurchase.update({
          where: { id },
          data: {
            storeId,
            vendorId,
            date: new Date(date),
            notes,
            total,
            items: {
              create: preparedItems.map((i) => ({
                productId: i.productId,
                quantity: i.quantity,
                price: i.price,
                total: i.total,
                newPrices: {
                  create:
                    i.newPrices?.map((np) => ({
                      priceTypeId: np.priceTypeId,
                      value: new Decimal(np.value),
                    })) || [],
                },
              })),
            },
          },
          include: { items: true },
        });
      },
      {
        isolationLevel: 'ReadCommitted', // Sufficient for DRAFT updates
      },
    );
  }

  async remove(id: string) {
    return this.prisma.$transaction(async (tx) => {
      const doc = await tx.documentPurchase.findUniqueOrThrow({
        where: { id },
      });

      if (doc.status !== 'DRAFT') {
        throw new BadRequestException('Только черновики могут быть удалены');
      }

      // Cascade delete is usually handled by DB, but explicit delete is safer if relations are complex
      // Prisma schema should ideally have onDelete: Cascade for items.
      // Let's assume schema handles it, or we delete items explicitly.
      // Based on typical Prisma setup without explicit relation mode, we delete items first.
      await tx.documentPurchaseItem.deleteMany({
        where: { purchaseId: id },
      });

      return tx.documentPurchase.delete({
        where: { id },
      });
    });
  }

  findAll() {
    return this.prisma.documentPurchase.findMany({
      include: {
        store: true,
        vendor: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  findOne(id: string) {
    return this.prisma.documentPurchase.findUniqueOrThrow({
      where: { id },
      include: {
        items: {
          include: { product: true, newPrices: true },
        },
        vendor: true,
        store: true,
      },
    });
  }

  async applyDelayedProductPriceUpdates(
    tx: Prisma.TransactionClient,
    documentId: string,
    items: Prisma.DocumentPurchaseItemGetPayload<{
      include: { newPrices: true };
    }>[],
  ) {
    for (const item of items) {
      if (item.newPrices && item.newPrices.length > 0) {
        for (const priceUpdate of item.newPrices) {
          // 1. Create History Record (Audit)
          await tx.priceHistory.create({
            data: {
              productId: item.productId,
              priceTypeId: priceUpdate.priceTypeId,
              value: priceUpdate.value,
              documentPurchaseId: documentId,
            },
          });

          // 2. Update Current Price (Showcase)
          await tx.price.upsert({
            where: {
              productId_priceTypeId: {
                productId: item.productId,
                priceTypeId: priceUpdate.priceTypeId,
              },
            },
            create: {
              productId: item.productId,
              priceTypeId: priceUpdate.priceTypeId,
              value: priceUpdate.value,
            },
            update: {
              value: priceUpdate.value,
            },
          });
        }
      }
    }
  }
}
