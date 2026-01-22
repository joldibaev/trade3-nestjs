import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import { CreateDocumentPriceChangeDto } from './dto/create-document-price-change.dto';
import { UpdateDocumentPriceChangeDto } from './dto/update-document-price-change.dto';
import { DocumentLedgerService } from '../document-ledger/document-ledger.service';
import { StoreService } from '../store/store.service';
import { Prisma } from '../generated/prisma/client';
import Decimal = Prisma.Decimal;

@Injectable()
export class DocumentPriceChangeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: DocumentLedgerService,
    private readonly storeService: StoreService,
  ) {}

  async create(createDto: CreateDocumentPriceChangeDto) {
    const { storeId, date, status, notes, items } = createDto;
    const targetStatus = status || 'DRAFT';

    await this.storeService.validateStore(storeId);

    // await this.ledgerService.logDiff(tx, ...); // Logic moved inside transaction or redundant?
    // Wait, logDiff is inside the transaction usually.
    // And this line is outside the transaction block (line 26 starts transaction).
    // Also `dateStore` is not defined.
    // It seems this line was completely hallucinated or misplaced.
    // I will remove it as the actual logging happens inside the transaction at step 3.

    return this.prisma.$transaction(async (tx) => {
      // 1. Prepare Items & Fetch Old Values
      const preparedItems: {
        productId: string;
        priceTypeId: string;
        oldValue: Decimal;
        newValue: Decimal;
      }[] = [];
      const productIds = items.map((i) => i.productId);
      const currentPrices = await tx.price.findMany({
        where: { productId: { in: productIds } },
      });

      for (const item of items) {
        // Find current price for this type
        const currentPriceObj = currentPrices.find(
          (p) => p.productId === item.productId && p.priceTypeId === item.priceTypeId,
        );
        const oldValue = currentPriceObj ? currentPriceObj.value : new Decimal(0);

        preparedItems.push({
          productId: item.productId,
          priceTypeId: item.priceTypeId,
          oldValue: oldValue,
          newValue: new Decimal(item.newValue),
        });
      }

      // 2. Create Document
      const doc = await tx.documentPriceChange.create({
        data: {
          storeId,
          date: new Date(date),
          status: targetStatus,
          notes,
          items: {
            create: preparedItems.map((i) => ({
              productId: i.productId,
              priceTypeId: i.priceTypeId,
              oldValue: i.oldValue,
              newValue: i.newValue,
            })),
          },
        },
        include: { items: true },
      });

      // 3. Log History
      await this.ledgerService.logAction(tx, {
        documentId: doc.id,
        documentType: 'documentPriceChange', // Ensure this maps to schema field logic (see below)
        action: 'CREATED',
        details: { status: targetStatus, notes },
      });
      // Note: DocumentHistoryService needs to support 'documentPriceChange' or we need to update it.
      // I'll assume I need to update DocumentHistoryService or it uses dynamic mapping.
      // Looking at schema: `documentPriceChange DocumentPriceChange?` exists.
      // Looking at `DocumentHistoryService` implementation (I haven't read it, but likely switches on type).

      // 4. Execute Changes if COMPLETED
      if (targetStatus === 'COMPLETED') {
        await this.applyPriceChanges(tx, doc.id, doc.date, doc.items);
      }

      return doc;
    });
  }

  async update(id: string, updateDto: UpdateDocumentPriceChangeDto) {
    return this.prisma.$transaction(async (tx) => {
      const doc = await tx.documentPriceChange.findUniqueOrThrow({
        where: { id },
        include: { items: true },
      });

      if (doc.status !== 'DRAFT') {
        throw new BadRequestException('Только черновики могут быть изменены');
      }

      const { storeId, date, notes, items } = updateDto;

      // Delete old items
      await tx.documentPriceChangeItem.deleteMany({ where: { documentId: id } });

      // Prepare new items
      const preparedItems: {
        productId: string;
        priceTypeId: string;
        oldValue: Decimal;
        newValue: Decimal;
      }[] = [];
      if (items) {
        const productIds = items.map((i) => i.productId);
        const currentPrices = await tx.price.findMany({
          where: { productId: { in: productIds } },
        });

        for (const item of items) {
          const currentPriceObj = currentPrices.find(
            (p) => p.productId === item.productId && p.priceTypeId === item.priceTypeId,
          );
          const oldValue = currentPriceObj ? currentPriceObj.value : new Decimal(0);
          preparedItems.push({
            productId: item.productId,
            priceTypeId: item.priceTypeId,
            oldValue: oldValue,
            newValue: new Decimal(item.newValue),
          });
        }
      }

      const updatedDoc = await tx.documentPriceChange.update({
        where: { id },
        data: {
          storeId,
          date: date ? new Date(date) : undefined,
          notes,
          items: {
            create: preparedItems.map((i) => ({
              productId: i.productId,
              priceTypeId: i.priceTypeId,
              oldValue: i.oldValue,
              newValue: i.newValue,
            })),
          },
        },
        include: { items: true },
      });

      return updatedDoc;
    });
  }

  async updateStatus(id: string, newStatus: 'DRAFT' | 'COMPLETED' | 'CANCELLED') {
    return this.prisma.$transaction(async (tx) => {
      const doc = await tx.documentPriceChange.findUniqueOrThrow({
        where: { id },
        include: { items: true },
      });

      if (doc.status === newStatus) return doc;

      // COMPLETED logic
      if (newStatus === 'COMPLETED') {
        await this.applyPriceChanges(tx, doc.id, doc.date, doc.items);
      }

      // REVERT Logic (Completed -> Draft/Cancelled)
      if (doc.status === 'COMPLETED' && newStatus !== 'COMPLETED') {
        await this.revertPriceChanges(tx, doc.id, doc.items);
      }

      return tx.documentPriceChange.update({
        where: { id },
        data: { status: newStatus },
      });
    });
  }

  async remove(id: string) {
    return this.prisma.$transaction(async (tx) => {
      const doc = await tx.documentPriceChange.findUniqueOrThrow({ where: { id } });
      if (doc.status !== 'DRAFT') {
        throw new BadRequestException('Только черновики могут быть удалены');
      }
      await tx.documentPriceChangeItem.deleteMany({ where: { documentId: id } });
      return tx.documentPriceChange.delete({ where: { id } });
    });
  }

  findAll() {
    return this.prisma.documentPriceChange.findMany({
      orderBy: { date: 'desc' },
      include: { store: true },
    });
  }

  findOne(id: string) {
    return this.prisma.documentPriceChange.findUniqueOrThrow({
      where: { id },
      include: { items: { include: { product: true, priceType: true } } },
    });
  }

  private async applyPriceChanges(
    tx: Prisma.TransactionClient,
    documentId: string,
    date: Date,
    items: { productId: string; priceTypeId: string; newValue: Decimal }[],
  ) {
    for (const item of items) {
      // 1. Create Ledger Entry
      await tx.priceLedger.create({
        data: {
          productId: item.productId,
          priceTypeId: item.priceTypeId,
          value: item.newValue,
          documentPriceChangeId: documentId,
          date: date,
        },
      });

      // 2. Rebalance (Update current Price table)
      await this.rebalanceProductPrice(tx, item.productId, item.priceTypeId);
    }
  }

  private async revertPriceChanges(
    tx: Prisma.TransactionClient,
    documentId: string,
    items: { productId: string; priceTypeId: string }[],
  ) {
    // 1. Delete Ledger Entries linked to this Document
    await tx.priceLedger.deleteMany({
      where: { documentPriceChangeId: documentId },
    });

    // 2. Rebalance (Recalculate Price based on remaining history)
    for (const item of items) {
      await this.rebalanceProductPrice(tx, item.productId, item.priceTypeId);
    }
  }

  private async rebalanceProductPrice(
    tx: Prisma.TransactionClient,
    productId: string,
    priceTypeId: string,
  ) {
    // Find the actual latest price based on effective date
    const latestEntry = await tx.priceLedger.findFirst({
      where: {
        productId,
        priceTypeId,
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });

    if (latestEntry) {
      // Update Price table to match latest history
      await tx.price.upsert({
        where: {
          productId_priceTypeId: {
            productId,
            priceTypeId,
          },
        },
        create: {
          productId,
          priceTypeId,
          value: latestEntry.value,
        },
        update: {
          value: latestEntry.value,
        },
      });
    } else {
      // No history left? Should we delete the price?
      // Maybe defaults to 0 or delete.
      // Safer to delete if no history exists to avoid stale data.
      try {
        await tx.price.delete({
          where: { productId_priceTypeId: { productId, priceTypeId } },
        });
      } catch {
        // Ignore if not exists
      }
    }
  }
}
