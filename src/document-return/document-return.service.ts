import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import { InventoryService } from '../core/inventory/inventory.service';
import { Prisma } from '../generated/prisma/client';
import { CreateDocumentReturnDto } from './dto/create-document-return.dto';
import Decimal = Prisma.Decimal;

interface PreparedReturnItem {
  productId: string;
  quantity: Decimal;
  fallbackWap: Decimal;
}

interface ReturnContext {
  id?: string;
  storeId: string;
  date?: Date;
}

@Injectable()
export class DocumentReturnService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
  ) {}

  async create(createDocumentReturnDto: CreateDocumentReturnDto) {
    const { storeId, clientId, date, status, items } = createDocumentReturnDto;

    const targetStatus = status || 'COMPLETED';

    // 1. Validate Store
    await this.inventoryService.validateStore(storeId);

    // 2. Prepare Items
    const productIds = items.map((i) => i.productId);

    // Fetch fallback WAPs for all products in one go
    const wapMap = await this.inventoryService.getFallbackWapMap(productIds);

    // Calculate totals & Prepare items
    let totalAmount = new Decimal(0);
    const returnItems = items.map((item) => {
      // Default price to 0 if not provided
      const price = new Decimal(item.price || 0);
      const quantity = new Decimal(item.quantity);
      const total = quantity.mul(price);
      totalAmount = totalAmount.add(total);

      // Determine fallback WAP for this product
      // Strategy: Use WAP from another store if available
      const fallbackWap = wapMap.get(item.productId) || new Decimal(0);

      return {
        productId: item.productId,
        quantity,
        price,
        total,
        fallbackWap,
      };
    });

    return this.prisma.$transaction(
      async (tx) => {
        const doc = await tx.documentReturn.create({
          data: {
            storeId,
            clientId,
            date: date ? new Date(date) : new Date(),
            status: targetStatus,
            totalAmount,
            items: {
              create: returnItems.map((i) => ({
                productId: i.productId,
                quantity: i.quantity,
                price: i.price,
                total: i.total,
              })),
            },
          },
          include: { items: true },
        });

        if (doc.status === 'COMPLETED') {
          await this.applyInventoryMovements(tx, doc, returnItems);
        }

        return doc;
      },
      {
        isolationLevel: 'ReadCommitted',
      },
    );
  }

  async updateStatus(id: string, newStatus: 'DRAFT' | 'COMPLETED' | 'CANCELLED') {
    return this.prisma.$transaction(
      async (tx) => {
        const doc = await tx.documentReturn.findUniqueOrThrow({
          where: { id },
          include: { items: true },
        });

        const oldStatus = doc.status;

        if (oldStatus === newStatus) {
          return doc;
        }

        if (oldStatus === 'CANCELLED') {
          throw new BadRequestException('Cannot change status of CANCELLED document');
        }

        const productIds = doc.items.map((i) => i.productId);
        const wapMap = await this.inventoryService.getFallbackWapMap(productIds);

        const items = doc.items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          fallbackWap: wapMap.get(i.productId) || new Decimal(0),
        }));

        // DRAFT -> COMPLETED
        if (oldStatus === 'DRAFT' && newStatus === 'COMPLETED') {
          await this.applyInventoryMovements(tx, doc, items);
        }

        // COMPLETED -> DRAFT (or CANCELLED)
        if (oldStatus === 'COMPLETED' && (newStatus === 'DRAFT' || newStatus === 'CANCELLED')) {
          // Revert stock (Decrease Stock)

          // 1. Validate Stock Availability (Must have enough to remove)
          await this.validateStockForRevert(tx, doc.storeId, items);

          // 2. Apply revert (negative quantity)
          const revertItems = items.map((i) => ({
            ...i,
            quantity: i.quantity.negated(),
          }));

          await this.applyInventoryMovements(tx, doc, revertItems);
        }

        return tx.documentReturn.update({
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
    items: PreparedReturnItem[],
  ) {
    // To revert a return, we remove items from stock.
    // We must ensure stock >= items.quantity
    const productIds = items.map((i) => i.productId);
    const stocks = await tx.stock.findMany({
      where: { storeId, productId: { in: productIds } },
    });
    const stockMap = new Map(stocks.map((s) => [s.productId, s.quantity]));

    for (const item of items) {
      const currentQty = stockMap.get(item.productId) || new Decimal(0);

      if (currentQty.lessThan(item.quantity)) {
        throw new BadRequestException(
          `Insufficient stock for product ${item.productId} to revert return (items were already sold/moved)`,
        );
      }
    }
  }

  private async applyInventoryMovements(
    tx: Prisma.TransactionClient,
    doc: ReturnContext,
    items: PreparedReturnItem[],
  ) {
    const storeId = doc.storeId;

    for (const item of items) {
      // Use atomic increment for concurrency safety
      // Upsert handles both "creation of new stock" and "update of existing"
      await tx.stock.upsert({
        where: {
          productId_storeId: { productId: item.productId, storeId },
        },
        create: {
          productId: item.productId,
          storeId,
          quantity: item.quantity,
          averagePurchasePrice: item.fallbackWap, // Use fetched fallback instead of 0
        },
        update: {
          quantity: { increment: item.quantity },
          // Note: We deliberately do NOT update WAP on return (as agreed),
          // assuming the returned item has the same cost structure or is negligible.
        },
      });

      // Fetch updated stock for accurate snapshot
      const updatedStock = await tx.stock.findUniqueOrThrow({
        where: {
          productId_storeId: { productId: item.productId, storeId },
        },
      });

      // Audit: Log Stock Movement
      await this.inventoryService.logStockMovement(tx, {
        type: 'RETURN',
        storeId,
        productId: item.productId,
        quantity: item.quantity,
        date: doc.date ?? new Date(),
        documentId: doc.id ?? '',
        quantityAfter: updatedStock.quantity,
        averagePurchasePrice: updatedStock.averagePurchasePrice,
      });
    }
  }

  async update(id: string, updateDto: CreateDocumentReturnDto) {
    return this.prisma.$transaction(
      async (tx) => {
        const doc = await tx.documentReturn.findUniqueOrThrow({
          where: { id },
          include: { items: true },
        });

        if (doc.status !== 'DRAFT') {
          throw new BadRequestException('Only DRAFT documents can be updated');
        }

        const { storeId, clientId, date, items } = updateDto;

        // 1. Prepare Items
        const productIds = items.map((i) => i.productId);
        const wapMap = await this.inventoryService.getFallbackWapMap(productIds);

        let totalAmount = new Decimal(0);
        const returnItems = items.map((item) => {
          const price = new Decimal(item.price || 0);
          const quantity = new Decimal(item.quantity);
          const total = quantity.mul(price);
          totalAmount = totalAmount.add(total);
          const fallbackWap = wapMap.get(item.productId) || new Decimal(0);

          return {
            productId: item.productId,
            quantity,
            price,
            total,
            fallbackWap,
          };
        });

        // 2. Delete existing items
        await tx.documentReturnItem.deleteMany({
          where: { returnId: id },
        });

        // 3. Update Document
        return tx.documentReturn.update({
          where: { id },
          data: {
            storeId,
            clientId,
            date: date ? new Date(date) : new Date(),
            totalAmount,
            items: {
              create: returnItems.map((i) => ({
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
      const doc = await tx.documentReturn.findUniqueOrThrow({
        where: { id },
      });

      if (doc.status !== 'DRAFT') {
        throw new BadRequestException('Only DRAFT documents can be deleted');
      }

      await tx.documentReturnItem.deleteMany({
        where: { returnId: id },
      });

      return tx.documentReturn.delete({
        where: { id },
      });
    });
  }

  findAll(include?: Record<string, boolean>) {
    return this.prisma.documentReturn.findMany({
      include,
      orderBy: { createdAt: 'desc' },
    });
  }

  findOne(id: string, include?: Record<string, boolean>) {
    return this.prisma.documentReturn.findUniqueOrThrow({
      where: { id },
      include,
    });
  }
}
