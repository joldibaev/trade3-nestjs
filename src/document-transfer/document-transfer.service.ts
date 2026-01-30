import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { CodeGeneratorService } from '../code-generator/code-generator.service';
import { BaseDocumentService } from '../common/base-document.service';
import { DocumentHistoryService } from '../document-history/document-history.service';
import { DocumentTransfer, Prisma } from '../generated/prisma/client';
import { DocumentStatus, LedgerReason } from '../generated/prisma/enums';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import { StockLedgerService } from '../stock-ledger/stock-ledger.service';
import { StoreService } from '../store/store.service';
import { CreateDocumentTransferDto } from './dto/create-document-transfer.dto';
import { CreateDocumentTransferItemDto } from './dto/create-document-transfer-item.dto';
import Decimal = Prisma.Decimal;

@Injectable()
export class DocumentTransferService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly storeService: StoreService,
    private readonly stockLedgerService: StockLedgerService,
    private readonly ledgerService: DocumentHistoryService,
    private readonly baseService: BaseDocumentService,
    private readonly codeGenerator: CodeGeneratorService,
  ) {}

  async create(createDocumentTransferDto: CreateDocumentTransferDto): Promise<DocumentTransfer> {
    const { sourceStoreId, destinationStoreId, date, status, notes } = createDocumentTransferDto;

    let targetStatus = status || 'DRAFT';
    const docDate = date ? new Date(date) : new Date();

    if (targetStatus === 'COMPLETED' && docDate > new Date()) {
      targetStatus = 'SCHEDULED' as DocumentStatus;
    }

    if (sourceStoreId === destinationStoreId) {
      throw new BadRequestException('Склад отправителя и получателя должны отличаться');
    }

    // 1. Validate Stores
    await Promise.all([
      this.storeService.validateStore(sourceStoreId).catch(() => {
        throw new NotFoundException('Склад отправителя не найден');
      }),
      this.storeService.validateStore(destinationStoreId).catch(() => {
        throw new NotFoundException('Склад получателя не найден');
      }),
    ]);

    return this.prisma.$transaction(
      async (tx) => {
        // Generate Code
        const code = await this.codeGenerator.getNextTransferCode();

        // 4. Create Document
        const doc = await tx.documentTransfer.create({
          data: {
            code,
            sourceStoreId,
            destinationStoreId,
            date: docDate,
            status: targetStatus,
            notes,
          },
        });

        // Log CREATED
        await this.ledgerService.logAction(tx, {
          documentId: doc.id,
          documentType: 'documentTransfer',
          action: 'CREATED',
          details: { status: targetStatus, notes },
        });

        return doc;
      },
      {
        isolationLevel: 'ReadCommitted',
      },
    );
  }

  async update(id: string, updateDto: CreateDocumentTransferDto): Promise<DocumentTransfer> {
    return this.prisma.$transaction(async (tx) => {
      const doc = await tx.documentTransfer.findUniqueOrThrow({
        where: { id },
      });

      this.baseService.ensureDraft(doc.status);

      const { sourceStoreId, destinationStoreId, date, notes } = updateDto;
      const docDate = date ? new Date(date) : new Date();

      if (sourceStoreId && sourceStoreId !== doc.sourceStoreId) {
        if (sourceStoreId === (destinationStoreId || doc.destinationStoreId)) {
          throw new BadRequestException('Склад отправителя и получателя должны отличаться');
        }

        // Migrate Reservations
        const items = await tx.documentTransferItem.findMany({ where: { transferId: id } });
        if (items.length > 0) {
          const pIds = items.map((i) => i.productId);
          // Lock BOTH stores
          await this.inventoryService.lockInventory(
            tx,
            pIds.flatMap((pid) => [
              { storeId: doc.sourceStoreId, productId: pid },
              { storeId: sourceStoreId, productId: pid },
            ]),
          );

          const resItems = items.map((i) => ({ productId: i.productId, quantity: i.quantity }));
          // Release OLD
          await this.inventoryService.applyReservations(
            tx,
            doc.sourceStoreId,
            resItems.map((i) => ({ ...i, quantity: i.quantity.negated() })),
          );
          // Apply NEW
          await this.inventoryService.applyReservations(tx, sourceStoreId, resItems);
        }
      }

      // 3. Update Document
      const updatedDoc = await tx.documentTransfer.update({
        where: { id },
        data: {
          sourceStoreId,
          destinationStoreId,
          date: docDate,
          notes,
        },
      });

      const changes: Record<string, unknown> = {};
      if (notes !== undefined && notes !== (doc.notes ?? '')) {
        changes.notes = notes;
      }
      if (sourceStoreId !== doc.sourceStoreId) {
        changes.sourceStoreId = sourceStoreId;
      }
      if (destinationStoreId !== doc.destinationStoreId) {
        changes.destinationStoreId = destinationStoreId;
      }
      if (date && new Date(date).getTime() !== doc.date?.getTime()) {
        changes.date = date;
      }

      if (Object.keys(changes).length > 0) {
        await this.ledgerService.logAction(tx, {
          documentId: id,
          documentType: 'documentTransfer',
          action: 'UPDATED',
          details: changes,
        });
      }

      return updatedDoc;
    });
  }

  async addItems(id: string, itemsDto: CreateDocumentTransferItemDto[]): Promise<DocumentTransfer> {
    return this.prisma.$transaction(
      async (tx) => {
        const doc = await tx.documentTransfer.findUniqueOrThrow({
          where: { id },
        });

        this.baseService.ensureDraft(doc.status);

        // ACQUIRE LOCKS
        const pIds = itemsDto.map((i) => i.productId);
        await this.inventoryService.lockInventory(
          tx,
          pIds.map((pid) => ({ storeId: doc.sourceStoreId, productId: pid })),
        );

        const addedQuantities = new Map<string, Decimal>();

        for (const dto of itemsDto) {
          const { productId, quantity } = dto;
          const qVal = new Decimal(quantity);

          // 1. Stock Validation (Phys - Reserved)
          const stock = await tx.stock.findUnique({
            where: { productId_storeId: { productId, storeId: doc.sourceStoreId } },
          });
          const physicalQty = stock?.quantity || new Decimal(0);
          const reservedQty = stock?.reserved || new Decimal(0);
          const availableToPromise = physicalQty.sub(reservedQty);

          const inThisBatch = addedQuantities.get(productId) || new Decimal(0);

          if (inThisBatch.add(qVal).gt(availableToPromise)) {
            throw new BadRequestException(
              `Недостаточно свободного товара на складе отправителя (в наличии: ${physicalQty.toString()}, забронировано: ${reservedQty.toString()}, доступно: ${availableToPromise.toString()}, пытаетесь добавить: ${qVal.toString()})`,
            );
          }

          addedQuantities.set(productId, inThisBatch.add(qVal));

          await tx.documentTransferItem.create({
            data: {
              transferId: id,
              productId: productId,
              quantity: qVal,
            },
          });

          await this.ledgerService.logAction(tx, {
            documentId: id,
            documentType: 'documentTransfer',
            action: 'ITEM_ADDED',
            details: { productId: productId, quantity: qVal },
          });
        }

        // Apply Reservation
        await this.inventoryService.applyReservations(
          tx,
          doc.sourceStoreId,
          Array.from(addedQuantities.entries()).map(([productId, quantity]) => ({
            productId,
            quantity,
          })),
        );

        return tx.documentTransfer.findUniqueOrThrow({
          where: { id },
          include: {
            items: true,
            sourceStore: true,
            destinationStore: true,
            documentHistory: {
              orderBy: { createdAt: 'asc' },
            },
          },
        });
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }

  async updateItem(
    id: string,
    itemId: string,
    dto: CreateDocumentTransferItemDto,
  ): Promise<DocumentTransfer> {
    return this.prisma.$transaction(
      async (tx) => {
        const doc = await tx.documentTransfer.findUniqueOrThrow({
          where: { id },
        });

        this.baseService.ensureDraft(doc.status);

        const item = await tx.documentTransferItem.findUniqueOrThrow({
          where: { id: itemId },
        });

        // ACQUIRE LOCKS
        await this.inventoryService.lockInventory(tx, [
          { storeId: doc.sourceStoreId, productId: item.productId },
        ]);

        const { quantity } = dto;
        const qVal = new Decimal(quantity);
        const qDelta = qVal.sub(item.quantity);

        if (qDelta.isPositive()) {
          const stock = await tx.stock.findUnique({
            where: { productId_storeId: { productId: item.productId, storeId: doc.sourceStoreId } },
          });
          const physicalQty = stock?.quantity || new Decimal(0);
          const reservedQty = stock?.reserved || new Decimal(0);
          const availableToPromise = physicalQty.sub(reservedQty);

          if (qDelta.gt(availableToPromise)) {
            throw new BadRequestException(
              `Недостаточно свободного товара на складе отправителя (в наличии: ${physicalQty.toString()}, забронировано: ${reservedQty.toString()}, доступно: ${availableToPromise.toString()}, пытаетесь добавить еще: ${qDelta.toString()})`,
            );
          }
        }

        await tx.documentTransferItem.update({
          where: { id: itemId },
          data: {
            quantity: qVal,
          },
        });

        // Apply Reservation Delta
        await this.inventoryService.applyReservations(tx, doc.sourceStoreId, [
          { productId: item.productId, quantity: qDelta },
        ]);

        await this.ledgerService.logAction(tx, {
          documentId: id,
          documentType: 'documentTransfer',
          action: 'ITEM_CHANGED',
          details: {
            productId: item.productId,
            oldQuantity: item.quantity,
            newQuantity: qVal,
          },
        });

        return tx.documentTransfer.findUniqueOrThrow({
          where: { id },
          include: {
            items: true,
            sourceStore: true,
            destinationStore: true,
            documentHistory: {
              orderBy: { createdAt: 'asc' },
            },
          },
        });
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }

  async removeItems(id: string, itemIds: string[]): Promise<DocumentTransfer> {
    return this.prisma.$transaction(
      async (tx) => {
        const doc = await tx.documentTransfer.findUniqueOrThrow({
          where: { id },
        });

        this.baseService.ensureDraft(doc.status);

        const itemsToRemove = await tx.documentTransferItem.findMany({
          where: { id: { in: itemIds } },
        });

        if (itemsToRemove.length === 0) return doc;

        // ACQUIRE LOCKS
        const pIdsToRemove = itemsToRemove.map((i) => i.productId);
        await this.inventoryService.lockInventory(
          tx,
          pIdsToRemove.map((pid) => ({ storeId: doc.sourceStoreId, productId: pid })),
        );

        const removedQuantities = new Map<string, Decimal>();

        for (const itemId of itemIds) {
          const item = itemsToRemove.find((i) => i.id === itemId);
          if (!item) continue;

          await tx.documentTransferItem.delete({
            where: { id: itemId },
          });

          const currentRemoved = removedQuantities.get(item.productId) || new Decimal(0);
          removedQuantities.set(item.productId, currentRemoved.add(item.quantity));

          await this.ledgerService.logAction(tx, {
            documentId: id,
            documentType: 'documentTransfer',
            action: 'ITEM_REMOVED',
            details: { productId: item.productId, quantity: item.quantity },
          });
        }

        // Release Reservation
        await this.inventoryService.applyReservations(
          tx,
          doc.sourceStoreId,
          Array.from(removedQuantities.entries()).map(([productId, quantity]) => ({
            productId,
            quantity: quantity.negated(),
          })),
        );

        return tx.documentTransfer.findUniqueOrThrow({
          where: { id },
          include: {
            items: true,
            sourceStore: true,
            destinationStore: true,
            documentHistory: {
              orderBy: { createdAt: 'asc' },
            },
          },
        });
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }

  async updateStatus(id: string, newStatus: DocumentStatus): Promise<DocumentTransfer> {
    let productsToReprocess: string[] = [];

    const updatedDoc = await this.prisma.$transaction(
      async (tx) => {
        const doc = await tx.documentTransfer.findUniqueOrThrow({
          where: { id },
          include: { items: true },
        });

        const oldStatus = doc.status;
        let actualNewStatus = newStatus;

        if (newStatus === 'COMPLETED' && doc.date > new Date()) {
          actualNewStatus = 'SCHEDULED' as DocumentStatus;
        }

        if (oldStatus === actualNewStatus) {
          return doc;
        }

        if (oldStatus === 'CANCELLED') {
          throw new BadRequestException('Нельзя изменить статус отмененного документа');
        }

        const productIds = doc.items.map((i) => i.productId);
        const items = doc.items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
        }));

        // ACQUIRE LOCKS for all products involved in BOTH stores simultaneously to prevent deadlocks
        const locks = productIds.flatMap((pid) => [
          { storeId: doc.sourceStoreId, productId: pid },
          { storeId: doc.destinationStoreId, productId: pid },
        ]);
        await this.inventoryService.lockInventory(tx, locks);

        // DRAFT/SCHEDULED -> COMPLETED
        if (
          (oldStatus === 'DRAFT' || oldStatus === 'SCHEDULED') &&
          actualNewStatus === 'COMPLETED'
        ) {
          // 1. Release Reservation at Source Store
          await this.inventoryService.applyReservations(
            tx,
            doc.sourceStoreId,
            items.map((i) => ({ productId: i.productId, quantity: i.quantity.negated() })),
          );

          // 2. Apply Physical Movements
          await this.applyInventoryMovements(tx, doc, items, 'INITIAL');

          // Check if we need reprocessing (Backdated)
          productsToReprocess = productIds;
        }

        // COMPLETED -> DRAFT (or CANCELLED or SCHEDULED)
        if (
          oldStatus === 'COMPLETED' &&
          (actualNewStatus === 'DRAFT' ||
            actualNewStatus === 'CANCELLED' ||
            actualNewStatus === 'SCHEDULED')
        ) {
          // 1. Revert Physical Movements
          await this.applyInventoryMovements(tx, doc, items, 'REVERSAL');

          // 2. If moving back to DRAFT or SCHEDULED, RESTORE reservation at Source Store
          if (actualNewStatus === 'DRAFT' || actualNewStatus === 'SCHEDULED') {
            await this.inventoryService.applyReservations(
              tx,
              doc.sourceStoreId,
              items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
            );
          }

          productsToReprocess = productIds;
        }

        // Update status
        const updatedDoc = await tx.documentTransfer.update({
          where: { id },
          data: { status: actualNewStatus },
          include: { items: true },
        });

        await this.ledgerService.logAction(tx, {
          documentId: id,
          documentType: 'documentTransfer',
          action: 'STATUS_CHANGED',
          details: { from: oldStatus, to: newStatus },
        });
        return updatedDoc;
      },
      {
        isolationLevel: 'ReadCommitted',
      },
    );

    // POST-TRANSACTION: Reprocess History
    if (productsToReprocess.length > 0) {
      for (const productId of productsToReprocess) {
        await this.inventoryService.reprocessProductHistory(
          updatedDoc.sourceStoreId,
          productId,
          updatedDoc.date,
          id, // use document ID as causationId
        );
        await this.inventoryService.reprocessProductHistory(
          updatedDoc.destinationStoreId,
          productId,
          updatedDoc.date,
          id, // use document ID as causationId
        );
      }
    }

    return updatedDoc;
  }

  private async applyInventoryMovements(
    tx: Prisma.TransactionClient,
    doc: { id: string; sourceStoreId: string; destinationStoreId: string; date: Date },
    items: { productId: string; quantity: Decimal }[],
    reason: LedgerReason = 'INITIAL',
  ): Promise<void> {
    const { sourceStoreId, destinationStoreId, date, id } = doc;

    // 1. Fetch Source Stocks for WAP inheritance
    const sourceStocks = await tx.stock.findMany({
      where: {
        storeId: sourceStoreId,
        productId: { in: items.map((i) => i.productId) },
      },
    });
    const sourceStockMap = new Map(sourceStocks.map((s) => [s.productId, s]));

    // 2. Transfer OUT from Source
    const outMovements = items.map((item) => {
      const stock = sourceStockMap.get(item.productId);
      return {
        productId: item.productId,
        quantity: reason === 'REVERSAL' ? item.quantity.negated() : item.quantity,
        price: stock?.averagePurchasePrice || new Decimal(0),
      };
    });

    await this.inventoryService.applyMovements(
      tx,
      {
        storeId: sourceStoreId,
        type: 'TRANSFER_OUT',
        date,
        documentId: id,
        reason,
      },
      outMovements,
      'OUT',
    );

    // 3. Transfer IN to Destination
    const inMovements = items.map((item) => {
      const stock = sourceStockMap.get(item.productId);
      return {
        productId: item.productId,
        quantity: reason === 'REVERSAL' ? item.quantity.negated() : item.quantity,
        price: stock?.averagePurchasePrice || new Decimal(0),
      };
    });

    await this.inventoryService.applyMovements(
      tx,
      {
        storeId: destinationStoreId,
        type: 'TRANSFER_IN',
        date,
        documentId: id,
        reason,
      },
      inMovements,
      'IN',
    );
  }

  findAll(include?: Record<string, boolean>): Promise<DocumentTransfer[]> {
    return this.prisma.documentTransfer.findMany({
      include: include || { sourceStore: true, destinationStore: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  findOne(id: string): Promise<DocumentTransfer> {
    return this.prisma.documentTransfer.findUniqueOrThrow({
      where: { id },
      include: {
        items: {
          include: { product: true },
        },
        sourceStore: true,
        destinationStore: true,
        documentHistory: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }
}
