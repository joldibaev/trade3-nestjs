import { BadRequestException, Injectable } from '@nestjs/common';

import { CodeGeneratorService } from '../code-generator/code-generator.service';
import { BaseDocumentService } from '../common/base-document.service';
import { DocumentHistoryService } from '../document-history/document-history.service';
import { DocumentReturn, Prisma } from '../generated/prisma/client';
import { DocumentStatus } from '../generated/prisma/enums';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import { StoreService } from '../store/store.service';
import { CreateDocumentReturnDto } from './dto/create-document-return.dto';
import { CreateDocumentReturnItemDto } from './dto/create-document-return-item.dto';
import { UpdateDocumentReturnItemDto } from './dto/update-document-return-item.dto';
import Decimal = Prisma.Decimal;

@Injectable()
export class DocumentReturnService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly storeService: StoreService,
    private readonly ledgerService: DocumentHistoryService,
    private readonly baseService: BaseDocumentService,
    private readonly codeGenerator: CodeGeneratorService,
  ) {}

  async create(createDocumentReturnDto: CreateDocumentReturnDto): Promise<DocumentReturn> {
    const { storeId, clientId, date, status, notes } = createDocumentReturnDto;

    let targetStatus = status || 'DRAFT';
    const docDate = date ? new Date(date) : new Date();

    if (targetStatus === 'COMPLETED' && docDate > new Date()) {
      targetStatus = 'SCHEDULED' as DocumentStatus;
    }

    // 1. Validate Store
    await this.storeService.validateStore(storeId);

    return this.prisma.$transaction(async (tx) => {
      // Generate Code
      const code = await this.codeGenerator.getNextReturnCode();

      const newDoc = await tx.documentReturn.create({
        data: {
          code,
          storeId,
          clientId,
          date: docDate,
          status: targetStatus,
          notes,
          total: 0,
        },
      });

      // Log CREATED
      await this.ledgerService.logAction(tx, {
        documentId: newDoc.id,
        documentType: 'documentReturn',
        action: 'CREATED',
        details: { status: targetStatus, notes },
      });

      return newDoc;
    });
  }

  async update(id: string, updateDto: CreateDocumentReturnDto): Promise<DocumentReturn> {
    return this.prisma.$transaction(async (tx) => {
      const doc = await tx.documentReturn.findUniqueOrThrow({
        where: { id },
      });

      this.baseService.ensureDraft(doc.status);

      const { storeId, clientId, date, notes } = updateDto;
      const docDate = date ? new Date(date) : new Date();

      const updatedDoc = await tx.documentReturn.update({
        where: { id },
        data: {
          storeId,
          clientId,
          date: docDate,
          notes,
        },
      });

      const changes: Record<string, unknown> = {};
      if (notes !== undefined && notes !== (doc.notes ?? '')) {
        changes.notes = notes;
      }
      if (storeId !== doc.storeId) {
        changes.storeId = storeId;
      }
      if (clientId !== doc.clientId) {
        changes.clientId = clientId;
      }
      if (date && new Date(date).getTime() !== doc.date?.getTime()) {
        changes.date = date;
      }

      if (Object.keys(changes).length > 0) {
        await this.ledgerService.logAction(tx, {
          documentId: id,
          documentType: 'documentReturn',
          action: 'UPDATED',
          details: changes,
        });
      }

      return updatedDoc;
    });
  }

  async addItems(id: string, itemsDto: CreateDocumentReturnItemDto[]): Promise<DocumentReturn> {
    return this.prisma.$transaction(
      async (tx) => {
        const doc = await tx.documentReturn.findUniqueOrThrow({
          where: { id },
        });

        this.baseService.ensureDraft(doc.status);

        let totalAddition = new Decimal(0);

        for (const dto of itemsDto) {
          const { productId, quantity, price } = dto;
          const qDelta = new Decimal(quantity);
          const pVal = new Decimal(price || 0);
          const itemTotal = qDelta.mul(pVal);
          totalAddition = totalAddition.add(itemTotal);

          await tx.documentReturnItem.create({
            data: {
              returnId: id,
              productId: productId,
              quantity: qDelta,
              price: pVal,
              total: itemTotal,
            },
          });

          await this.ledgerService.logAction(tx, {
            documentId: id,
            documentType: 'documentReturn',
            action: 'ITEM_ADDED',
            details: { productId, quantity: qDelta, price: pVal, total: itemTotal },
          });
        }

        await tx.documentReturn.update({
          where: { id },
          data: { total: { increment: totalAddition } },
        });

        return tx.documentReturn.findUniqueOrThrow({
          where: { id },
          include: {
            items: true,
            client: true,
            store: true,
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
    dto: UpdateDocumentReturnItemDto,
  ): Promise<DocumentReturn> {
    return this.prisma.$transaction(
      async (tx) => {
        const doc = await tx.documentReturn.findUniqueOrThrow({
          where: { id },
        });

        this.baseService.ensureDraft(doc.status);

        const item = await tx.documentReturnItem.findUniqueOrThrow({
          where: { id: itemId },
        });

        const { quantity, price } = dto;
        const qDelta = quantity !== undefined ? new Decimal(quantity) : item.quantity;
        const pVal = price !== undefined ? new Decimal(price) : item.price;
        const newTotal = qDelta.mul(pVal);
        const amountDiff = newTotal.sub(item.total);

        await tx.documentReturnItem.update({
          where: { id: itemId },
          data: {
            quantity: qDelta,
            price: pVal,
            total: newTotal,
          },
        });

        await tx.documentReturn.update({
          where: { id },
          data: { total: { increment: amountDiff } },
        });

        await this.ledgerService.logAction(tx, {
          documentId: id,
          documentType: 'documentReturn',
          action: 'ITEM_CHANGED',
          details: {
            productId: item.productId,
            oldQuantity: item.quantity,
            newQuantity: qDelta,
            oldPrice: item.price,
            newPrice: pVal,
          },
        });

        return tx.documentReturn.findUniqueOrThrow({
          where: { id },
          include: {
            items: true,
            client: true,
            store: true,
            documentHistory: {
              orderBy: { createdAt: 'asc' },
            },
          },
        });
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }

  async removeItems(id: string, itemIds: string[]): Promise<DocumentReturn> {
    return this.prisma.$transaction(
      async (tx) => {
        const doc = await tx.documentReturn.findUniqueOrThrow({
          where: { id },
        });

        this.baseService.ensureDraft(doc.status);

        let totalSubtraction = new Decimal(0);

        for (const itemId of itemIds) {
          const item = await tx.documentReturnItem.findUniqueOrThrow({
            where: { id: itemId },
          });

          await tx.documentReturnItem.delete({
            where: { id: itemId },
          });

          totalSubtraction = totalSubtraction.add(item.total);

          await this.ledgerService.logAction(tx, {
            documentId: id,
            documentType: 'documentReturn',
            action: 'ITEM_REMOVED',
            details: { productId: item.productId, quantity: item.quantity, total: item.total },
          });
        }

        await tx.documentReturn.update({
          where: { id },
          data: { total: { decrement: totalSubtraction } },
        });

        return tx.documentReturn.findUniqueOrThrow({
          where: { id },
          include: {
            items: true,
            client: true,
            store: true,
            documentHistory: {
              orderBy: { createdAt: 'asc' },
            },
          },
        });
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }

  async updateStatus(id: string, newStatus: DocumentStatus): Promise<DocumentReturn> {
    let productsToReprocess: string[] = [];

    const updatedDoc = await this.prisma.$transaction(
      async (tx) => {
        const doc = await tx.documentReturn.findUniqueOrThrow({
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

        // ACQUIRE LOCKS for all products involved
        const productIds = doc.items.map((i) => i.productId);
        await this.inventoryService.lockInventory(
          tx,
          productIds.map((pid) => ({ storeId: doc.storeId, productId: pid })),
        );

        const wapMap = await this.inventoryService.getFallbackWapMap(productIds);

        const items = doc.items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          fallbackWap: wapMap.get(i.productId) || new Decimal(0),
        }));

        // DRAFT/SCHEDULED -> COMPLETED
        if (
          (oldStatus === 'DRAFT' || oldStatus === 'SCHEDULED') &&
          actualNewStatus === 'COMPLETED'
        ) {
          await this.inventoryService.applyMovements(
            tx,
            {
              storeId: doc.storeId,
              type: 'RETURN',
              date: doc.date ?? new Date(),
              documentId: doc.id ?? '',
              reason: 'INITIAL',
            },
            items.map((i) => ({
              productId: i.productId,
              quantity: i.quantity,
              price: i.fallbackWap,
            })),
            'IN',
          );

          // Check for backdated reprocessing
          productsToReprocess = productIds;
        }

        // COMPLETED -> DRAFT (or CANCELLED or SCHEDULED)
        if (
          oldStatus === 'COMPLETED' &&
          (actualNewStatus === 'DRAFT' ||
            actualNewStatus === 'CANCELLED' ||
            actualNewStatus === 'SCHEDULED')
        ) {
          // Revert stock (Decrease Stock) - use negative qty with reason REVERSAL
          const revertItems = items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity.negated(),
            price: i.fallbackWap,
          }));

          await this.inventoryService.applyMovements(
            tx,
            {
              storeId: doc.storeId,
              type: 'RETURN',
              date: doc.date ?? new Date(),
              documentId: doc.id ?? '',
              reason: 'REVERSAL',
            },
            revertItems,
            'IN',
          );

          // ALWAYS trigger reprocessing for REVERT
          productsToReprocess = productIds;
        }

        await this.ledgerService.logAction(tx, {
          documentId: id,
          documentType: 'documentReturn',
          action: 'STATUS_CHANGED',
          details: { from: oldStatus, to: newStatus },
        });

        return tx.documentReturn.update({
          where: { id },
          data: { status: actualNewStatus },
          include: { items: true },
        });
      },
      {
        isolationLevel: 'ReadCommitted',
      },
    );

    // POST-TRANSACTION: Reprocess History
    if (productsToReprocess.length > 0) {
      for (const pid of productsToReprocess) {
        await this.inventoryService.reprocessProductHistory(
          updatedDoc.storeId,
          pid,
          updatedDoc.date,
          id, // use document ID as causationId
        );
      }
    }

    return updatedDoc;
  }

  findAll(include?: Record<string, boolean>): Promise<DocumentReturn[]> {
    return this.prisma.documentReturn.findMany({
      include: include || { store: true, client: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  findOne(id: string): Promise<DocumentReturn> {
    return this.prisma.documentReturn.findUniqueOrThrow({
      where: { id },
      include: {
        items: {
          include: { product: true },
        },
        client: true,
        store: true,
        documentHistory: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }
}
