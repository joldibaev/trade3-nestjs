import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import { InventoryService } from '../core/inventory/inventory.service';
import { Prisma } from '../generated/prisma/client';
import Decimal = Prisma.Decimal;
import { CreateDocumentPurchaseDto } from './dto/create-document-purchase.dto';

@Injectable()
export class DocumentPurchaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
  ) {}

  async create(createDocumentPurchaseDto: CreateDocumentPurchaseDto) {
    const { storeId, vendorId, date, status, items } =
      createDocumentPurchaseDto;

    const targetStatus = status || 'COMPLETED';

    // 1. Validate Store
    await this.inventoryService.validateStore(storeId);

    // 2. Prepare Items
    const productIds = items.map((i) => i.productId);

    // Optional: Validate products exist
    const productsCount = await this.prisma.product.count({
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

    // 3. Execute Transaction
    return this.prisma.$transaction(
      async (tx) => {
        // Fetch existing stocks in batch
        const existingStocks = await tx.stock.findMany({
          where: {
            storeId,
            productId: { in: productIds },
          },
        });
        const stockMap = new Map(existingStocks.map((s) => [s.productId, s]));

        // Create DocumentPurchase
        const purchase = await tx.documentPurchase.create({
          data: {
            storeId,
            vendorId,
            date: date ? new Date(date) : new Date(),
            status: targetStatus,
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

        // Update Stock if COMPLETED
        if (targetStatus === 'COMPLETED') {
          // Process stock updates strictly sequentially to ensure transaction stability
          for (const item of preparedItems) {
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

            // Update Sales Prices if provided
            if (item.newPrices && item.newPrices.length > 0) {
              for (const priceUpdate of item.newPrices) {
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
                    value: new Decimal(priceUpdate.value),
                  },
                  update: {
                    value: new Decimal(priceUpdate.value),
                  },
                });
              }
            }

            // Audit: Log Stock Movement
            await this.inventoryService.logStockMovement(tx, {
              type: 'PURCHASE',
              storeId,
              productId: item.productId,
              quantity: item.quantity,
              date: purchase.date,
              documentId: purchase.id,
              quantityAfter: newQty,
              averagePurchasePrice: newWap,
            });
          }
        }

        return purchase;
      },
      {
        isolationLevel: 'Serializable', // Required for accurate WAP calculation
      },
    );
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
