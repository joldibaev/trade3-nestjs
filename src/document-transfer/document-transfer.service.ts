import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import { InventoryService } from '../core/inventory/inventory.service';
import { Prisma } from '../generated/prisma/client';
import Decimal = Prisma.Decimal;
import { CreateDocumentTransferDto } from './dto/create-document-transfer.dto';

interface PreparedTransferItem {
  productId: string;
  quantity: Decimal;
}

interface TransferContext {
  id?: string;
  sourceStoreId: string;
  destinationStoreId: string;
  date?: Date;
}

@Injectable()
export class DocumentTransferService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
  ) {}

  async create(createDocumentTransferDto: CreateDocumentTransferDto) {
    const { sourceStoreId, destinationStoreId, date, status, items } =
      createDocumentTransferDto;

    const targetStatus = status || 'COMPLETED';

    if (sourceStoreId === destinationStoreId) {
      throw new BadRequestException(
        'Source and Destination stores must be different',
      );
    }

    // 1. Validate Stores
    // Use concurrent validation
    await Promise.all([
      this.inventoryService.validateStore(sourceStoreId).catch(() => {
        throw new NotFoundException('Source Store not found');
      }),
      this.inventoryService.validateStore(destinationStoreId).catch(() => {
        throw new NotFoundException('Destination Store not found');
      }),
    ]);

    // Prepare Items
    const preparedItems = items.map((item) => ({
      productId: item.productId,
      quantity: new Decimal(item.quantity),
    }));

    return this.prisma.$transaction(
      async (tx) => {
        // 4. Create Document
        const doc = await tx.documentTransfer.create({
          data: {
            sourceStoreId,
            destinationStoreId,
            date: date ? new Date(date) : new Date(),
            status: targetStatus,
            items: {
              create: preparedItems.map((i) => ({
                productId: i.productId,
                quantity: i.quantity,
              })),
            },
          },
          include: { items: true },
        });

        if (targetStatus === 'COMPLETED') {
          await this.applyInventoryMovements(tx, doc, preparedItems);
        }

        return doc;
      },
      {
        isolationLevel: 'Serializable',
      },
    );
  }

  async complete(id: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const doc = await tx.documentTransfer.findUniqueOrThrow({
          where: { id },
          include: { items: true },
        });

        if (doc.status !== 'DRAFT') {
          throw new Error('Only DRAFT documents can be completed');
        }

        const items = doc.items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
        }));

        await this.applyInventoryMovements(tx, doc, items);

        return tx.documentTransfer.update({
          where: { id },
          data: { status: 'COMPLETED' },
          include: { items: true },
        });
      },
      {
        isolationLevel: 'Serializable',
      },
    );
  }

  private async applyInventoryMovements(
    tx: Prisma.TransactionClient,
    doc: TransferContext,
    items: PreparedTransferItem[],
  ) {
    const { sourceStoreId, destinationStoreId } = doc;
    const productIds = items.map((i) => i.productId);

    // 2. Batch Fetch Source Stocks
    const sourceStocks = await tx.stock.findMany({
      where: {
        storeId: sourceStoreId,
        productId: { in: productIds },
      },
    });
    const sourceStockMap = new Map(sourceStocks.map((s) => [s.productId, s]));

    // 3. Batch Fetch Destination Stocks
    const destStocks = await tx.stock.findMany({
      where: {
        storeId: destinationStoreId,
        productId: { in: productIds },
      },
    });
    const destStockMap = new Map(destStocks.map((s) => [s.productId, s]));

    for (const item of items) {
      const sourceStock = sourceStockMap.get(item.productId);
      const sourceQty = sourceStock ? sourceStock.quantity : new Decimal(0);

      // Validate Stock Availability
      if (sourceQty.lessThan(item.quantity)) {
        throw new BadRequestException(
          `Insufficient stock for product ${item.productId} in source store`,
        );
      }

      // --- Update Source Store ---
      await tx.stock.update({
        where: {
          productId_storeId: {
            productId: item.productId,
            storeId: sourceStoreId,
          },
        },
        data: {
          quantity: { decrement: item.quantity },
        },
      });

      // --- Update Destination Store ---
      const destStock = destStockMap.get(item.productId);
      const destQty = destStock ? destStock.quantity : new Decimal(0);
      const destWap = destStock
        ? destStock.averagePurchasePrice
        : new Decimal(0);

      const sourceWap = sourceStock
        ? sourceStock.averagePurchasePrice
        : new Decimal(0);

      const newDestQty = destQty.add(item.quantity);

      // Calculate New Destination WAP using helper
      // We treat transfer in as a "purchase" from the source store at sourceWap cost
      const newDestWap = this.inventoryService.calculateNewWap(
        destQty,
        destWap,
        item.quantity,
        sourceWap,
      );

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
          averagePurchasePrice: sourceWap, // Inherit cost from source
        },
        update: {
          quantity: newDestQty,
          averagePurchasePrice: newDestWap,
        },
      });

      // Fetch updated source stock for snapshot
      const updatedSourceStock = await tx.stock.findUniqueOrThrow({
        where: {
          productId_storeId: {
            productId: item.productId,
            storeId: sourceStoreId,
          },
        },
      });

      // Audit: Log TRANSFER_OUT
      await this.inventoryService.logStockMovement(tx, {
        type: 'TRANSFER_OUT',
        storeId: sourceStoreId,
        productId: item.productId,
        quantity: item.quantity.negated(),
        date: doc.date ?? new Date(),
        documentId: doc.id ?? '',
        quantityAfter: updatedSourceStock.quantity,
        averagePurchasePrice: updatedSourceStock.averagePurchasePrice,
      });

      // Audit: Log TRANSFER_IN
      await this.inventoryService.logStockMovement(tx, {
        type: 'TRANSFER_IN',
        storeId: destinationStoreId,
        productId: item.productId,
        quantity: item.quantity,
        date: doc.date ?? new Date(),
        documentId: doc.id ?? '',
        quantityAfter: newDestQty,
        averagePurchasePrice: newDestWap,
      });
    }
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
