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
  newPrices: PriceUpdate[];
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
  ) {}

  async create(createDocumentPurchaseDto: CreateDocumentPurchaseDto) {
    const { storeId, vendorId, date } = createDocumentPurchaseDto;

    const targetStatus = 'DRAFT';

    // 1. Validate Store
    await this.storeService.validateStore(storeId);

    // 2. Execute Transaction
    return this.prisma.$transaction(
      async (tx) => {
        // Create DocumentPurchase
        return tx.documentPurchase.create({
          data: {
            storeId,
            vendorId,
            date: new Date(date),
            status: targetStatus,
            totalAmount: new Decimal(0),
          },
          include: { items: true },
        });
      },
      {
        isolationLevel: 'Serializable',
      },
    );
  }

  async updateStatus(id: string, newStatus: 'DRAFT' | 'COMPLETED' | 'CANCELLED') {
    return this.prisma.$transaction(
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
          throw new BadRequestException('Cannot change status of CANCELLED document');
        }

        // Prepare items
        const items = purchase.items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          price: i.price,
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
          }));

          await this.applyInventoryMovements(tx, purchase, revertItems);
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
          `Insufficient stock for product ${item.productId} to revert purchase`,
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
          `Cannot revert purchase for product ${item.productId}: remaining stock value would be negative. Use Adjustment or Return instead.`,
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
        quantityAfter: newQty,
        averagePurchasePrice: newWap,
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
          throw new BadRequestException('Only DRAFT documents can be updated');
        }

        const { storeId, vendorId, date, items } = updateDto;

        // 1. Prepare new Items
        const productIds = items.map((i) => i.productId);

        // Validate products exist (Optional but good practice)
        const productsCount = await tx.product.count({
          where: { id: { in: productIds } },
        });
        if (productsCount !== productIds.length) {
          throw new BadRequestException('Some products not found');
        }

        const preparedItems = items.map((item) => {
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

        const totalAmount = preparedItems.reduce(
          (sum, item) => sum.add(item.total),
          new Decimal(0),
        );

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
            totalAmount,
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
        throw new BadRequestException('Only DRAFT documents can be deleted');
      }

      // Cascade delete is usually handled by DB, but explicit delete is safer if relations are complex
      // Prisma schema should ideally have onDelete: Cascade for items.
      // Let's assume schema handles it or we delete items explicitly.
      // Based on typical Prisma setup without explicit relation mode, we delete items first.
      await tx.documentPurchaseItem.deleteMany({
        where: { purchaseId: id },
      });

      return tx.documentPurchase.delete({
        where: { id },
      });
    });
  }

  findAll(include?: Record<string, boolean>) {
    return this.prisma.documentPurchase.findMany({
      include,
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
