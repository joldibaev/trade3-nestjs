import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { DocumentStatus } from '../generated/prisma/enums';
import { PrismaService } from '../core/prisma/prisma.service';
import { InventoryService } from '../core/inventory/inventory.service';
import { CreateDocumentAdjustmentDto } from './dto/create-document-adjustment.dto';
import { CreateDocumentAdjustmentItemDto } from './dto/create-document-adjustment-item.dto';
import { StoreService } from '../store/store.service';
import { DocumentHistoryService } from '../document-history/document-history.service';
import { BaseDocumentService } from '../common/base-document.service';
import { CodeGeneratorService } from '../core/code-generator/code-generator.service';
import Decimal = Prisma.Decimal;

@Injectable()
export class DocumentAdjustmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly storeService: StoreService,
    private readonly ledgerService: DocumentHistoryService,
    private readonly baseService: BaseDocumentService,
    private readonly codeGenerator: CodeGeneratorService,
  ) {}

  async create(createDocumentAdjustmentDto: CreateDocumentAdjustmentDto) {
    const { storeId, date, status, notes } = createDocumentAdjustmentDto;

    let targetStatus = status || 'DRAFT';
    const docDate = date ? new Date(date) : new Date();

    if (targetStatus === 'COMPLETED' && docDate > new Date()) {
      targetStatus = 'SCHEDULED' as DocumentStatus;
    }

    // 1. Validate Store
    await this.storeService.validateStore(storeId);

    return this.prisma.$transaction(async (tx) => {
      // Generate Code
      const code = await this.codeGenerator.getNextAdjustmentCode();

      // 4. Create Document
      const newDoc = await tx.documentAdjustment.create({
        data: {
          code,
          storeId,
          date: docDate,
          status: targetStatus,
          notes,
        },
      });

      await this.ledgerService.logAction(tx, {
        documentId: newDoc.id,
        documentType: 'documentAdjustment',
        action: 'CREATED',
        details: { status: targetStatus, notes },
      });

      return newDoc;
    });
  }

  async update(id: string, updateDto: CreateDocumentAdjustmentDto) {
    return this.prisma.$transaction(async (tx) => {
      const doc = await tx.documentAdjustment.findUniqueOrThrow({
        where: { id },
      });

      this.baseService.ensureDraft(doc.status);

      const { storeId, date, notes } = updateDto;
      const docDate = date ? new Date(date) : new Date();

      const updatedDoc = await tx.documentAdjustment.update({
        where: { id },
        data: {
          storeId,
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
      if (date && new Date(date).getTime() !== doc.date?.getTime()) {
        changes.date = date;
      }

      if (Object.keys(changes).length > 0) {
        await this.ledgerService.logAction(tx, {
          documentId: updatedDoc.id,
          documentType: 'documentAdjustment',
          action: 'UPDATED',
          details: changes,
        });
      }

      return updatedDoc;
    });
  }

  async addItems(id: string, itemsDto: CreateDocumentAdjustmentItemDto[]) {
    return this.prisma.$transaction(
      async (tx) => {
        const doc = await tx.documentAdjustment.findUniqueOrThrow({
          where: { id },
          include: { items: true },
        });

        this.baseService.ensureDraft(doc.status);

        for (const dto of itemsDto) {
          const { productId, quantity } = dto;
          const qDelta = new Decimal(quantity);

          // Fetch current stock to calculate snapshots
          const stock = await tx.stock.findUnique({
            where: { productId_storeId: { productId: productId, storeId: doc.storeId } },
          });

          const quantityBefore = stock ? stock.quantity : new Decimal(0);
          const quantityAfter = quantityBefore.add(qDelta);

          await tx.documentAdjustmentItem.create({
            data: {
              adjustmentId: id,
              productId: productId,
              quantity: qDelta,
              quantityBefore,
              quantityAfter,
            },
          });

          await this.ledgerService.logAction(tx, {
            documentId: id,
            documentType: 'documentAdjustment',
            action: 'ITEM_ADDED',
            details: { productId, quantity: qDelta },
          });
        }

        return tx.documentAdjustment.findUniqueOrThrow({
          where: { id },
          include: {
            items: true,
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

  async updateItem(id: string, itemId: string, dto: CreateDocumentAdjustmentItemDto) {
    return this.prisma.$transaction(
      async (tx) => {
        const doc = await tx.documentAdjustment.findUniqueOrThrow({
          where: { id },
        });

        this.baseService.ensureDraft(doc.status);

        const item = await tx.documentAdjustmentItem.findUniqueOrThrow({
          where: { id: itemId },
        });

        const { quantity } = dto;
        const qDelta = new Decimal(quantity);

        // Recalculate snapshots based on original quantityBefore
        const quantityAfter = item.quantityBefore.add(qDelta);

        await tx.documentAdjustmentItem.update({
          where: { id: itemId },
          data: {
            quantity: qDelta,
            quantityAfter,
          },
        });

        await this.ledgerService.logAction(tx, {
          documentId: id,
          documentType: 'documentAdjustment',
          action: 'ITEM_CHANGED',
          details: {
            productId: item.productId,
            oldQuantity: item.quantity,
            newQuantity: qDelta,
          },
        });

        return tx.documentAdjustment.findUniqueOrThrow({
          where: { id },
          include: {
            items: true,
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

  async removeItems(id: string, itemIds: string[]) {
    return this.prisma.$transaction(
      async (tx) => {
        const doc = await tx.documentAdjustment.findUniqueOrThrow({
          where: { id },
        });

        this.baseService.ensureDraft(doc.status);

        for (const itemId of itemIds) {
          const item = await tx.documentAdjustmentItem.findUniqueOrThrow({
            where: { id: itemId },
          });

          await tx.documentAdjustmentItem.delete({
            where: { id: itemId },
          });

          await this.ledgerService.logAction(tx, {
            documentId: id,
            documentType: 'documentAdjustment',
            action: 'ITEM_REMOVED',
            details: { productId: item.productId, quantity: item.quantity },
          });
        }

        return tx.documentAdjustment.findUniqueOrThrow({
          where: { id },
          include: {
            items: true,
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

  async updateStatus(id: string, newStatus: DocumentStatus) {
    let productsToReprocess: string[] = [];

    const updatedDoc = await this.prisma.$transaction(
      async (tx) => {
        const doc = await tx.documentAdjustment.findUniqueOrThrow({
          where: { id },
          include: { items: true },
        });

        let actualNewStatus = newStatus;

        if (newStatus === 'COMPLETED' && doc.date > new Date()) {
          actualNewStatus = 'SCHEDULED' as DocumentStatus;
        }

        if (doc.status === actualNewStatus) {
          return doc;
        }

        const productIds = doc.items.map((i) => i.productId);
        const fallbackWapMap = await this.inventoryService.getFallbackWapMap(productIds);

        // DRAFT/SCHEDULED -> COMPLETED
        if (
          (doc.status === 'DRAFT' || doc.status === 'SCHEDULED') &&
          actualNewStatus === 'COMPLETED'
        ) {
          const movements = doc.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            price: fallbackWapMap.get(item.productId) || new Decimal(0),
          }));

          await this.inventoryService.applyMovements(
            tx,
            {
              storeId: doc.storeId,
              type: 'ADJUSTMENT',
              date: doc.date ?? new Date(),
              documentId: doc.id ?? '',
              reason: 'INITIAL',
            },
            movements,
            'IN',
          );

          // Check for backdated reprocessing
          productsToReprocess = productIds;
        }

        // COMPLETED -> DRAFT/CANCELLED/SCHEDULED
        else if (
          doc.status === 'COMPLETED' &&
          (actualNewStatus === 'DRAFT' ||
            actualNewStatus === 'CANCELLED' ||
            actualNewStatus === 'SCHEDULED')
        ) {
          const revertMovements = doc.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity.negated(),
            price: fallbackWapMap.get(item.productId) || new Decimal(0),
          }));

          await this.inventoryService.applyMovements(
            tx,
            {
              storeId: doc.storeId,
              type: 'ADJUSTMENT',
              date: doc.date ?? new Date(),
              documentId: doc.id ?? '',
              reason: 'REVERSAL',
            },
            revertMovements,
            'IN',
          );

          // ALWAYS trigger reprocessing for REVERT
          productsToReprocess = productIds;
        }

        await this.ledgerService.logAction(tx, {
          documentId: id,
          documentType: 'documentAdjustment',
          action: 'STATUS_CHANGED',
          details: { from: doc.status, to: newStatus },
        });

        return tx.documentAdjustment.update({
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

  findAll(include?: Record<string, boolean>) {
    return this.prisma.documentAdjustment.findMany({
      include,
      orderBy: { createdAt: 'desc' },
    });
  }

  findOne(id: string) {
    return this.prisma.documentAdjustment.findUniqueOrThrow({
      where: { id },
      include: {
        items: true,
        store: true,
        documentHistory: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }
}
