import { BadRequestException, Injectable } from '@nestjs/common';

import { CodeGeneratorService } from '../code-generator/code-generator.service';
import { BaseDocumentService } from '../common/base-document.service';
import { DocumentHistoryService } from '../document-history/document-history.service';
import { DocumentPurchase, Prisma } from '../generated/prisma/client';
import { DocumentStatus } from '../generated/prisma/enums';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import { StoreService } from '../store/store.service';
import { CreateDocumentPurchaseDto } from './dto/create-document-purchase.dto';
import { CreateDocumentPurchaseItemDto } from './dto/create-document-purchase-item.dto';
import { UpdateDocumentPurchaseDto } from './dto/update-document-purchase.dto';
import { UpdateDocumentPurchaseItemDto } from './dto/update-document-purchase-item.dto';
import { UpdateProductPriceDto } from './dto/update-product-price.dto';
import Decimal = Prisma.Decimal;

interface PreparedPurchaseItem {
  productId: string;
  quantity: Decimal;
  price: Decimal;
  total: Decimal;
  newPrices?: UpdateProductPriceDto[];
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
    private readonly ledgerService: DocumentHistoryService,
    private readonly baseService: BaseDocumentService,
    private readonly codeGenerator: CodeGeneratorService,
  ) {}

  async create(
    createDocumentPurchaseDto: CreateDocumentPurchaseDto,
    userId?: string,
  ): Promise<DocumentPurchase> {
    const { storeId, vendorId, date, status, notes } = createDocumentPurchaseDto;

    let targetStatus = status || 'DRAFT';

    // 0. Validate Date
    const docDate = new Date(date);

    // Auto-schedule if date is in the future
    if (targetStatus === 'COMPLETED' && docDate > new Date()) {
      targetStatus = 'SCHEDULED' as DocumentStatus;
    }

    // 1. Validate Store
    await this.storeService.validateStore(storeId);

    // 2. Execute Transaction
    const result = await this.prisma.$transaction(
      async (tx) => {
        // Generate Code
        const code = await this.codeGenerator.getNextPurchaseCode();

        // Create DocumentPurchase
        const doc = await tx.documentPurchase.create({
          data: {
            code,
            storeId,
            vendorId,
            date: docDate,
            status: targetStatus,
            notes,
            total: new Decimal(0),
            authorId: userId || null,
          },
          include: { items: true },
        });

        await this.ledgerService.logAction(tx, {
          documentId: doc.id,
          documentType: 'documentPurchase',
          action: 'CREATED',
          details: { status: targetStatus, total: 0, notes },
          authorId: userId,
        });

        // 3. Apply Inventory Movements (Only if COMPLETED)
        if (targetStatus === 'COMPLETED') {
          // Logic for empty completed document?
          // Usually irrelevant as it has 0 items.
          // But if we allow completing empty docs, we do nothing inventory-wise.
        }

        return { doc };
      },
      {
        isolationLevel: 'ReadCommitted',
      },
    );

    return result.doc;
  }

  async updateStatus(
    id: string,
    newStatus: DocumentStatus,
    userId?: string,
  ): Promise<DocumentPurchase> {
    let productsToReprocess: string[] = [];

    const updatedPurchase = await this.prisma.$transaction(
      async (tx) => {
        const purchase = await tx.documentPurchase.findUniqueOrThrow({
          where: { id },
          include: {
            items: true,
          },
        });

        const oldStatus = purchase.status;
        let actualNewStatus = newStatus;

        // ACQUIRE LOCKS for all products involved
        const productIds = purchase.items.map((i) => i.productId);
        await this.inventoryService.lockInventory(
          tx,
          productIds.map((pid) => ({ storeId: purchase.storeId, productId: pid })),
        );

        // Auto-schedule if date is in the future
        // Note: when Scheduler calls this, date will be <= now, so it will proceed to "COMPLETED".
        if (newStatus === 'COMPLETED' && purchase.date > new Date()) {
          actualNewStatus = 'SCHEDULED' as DocumentStatus;
        }

        if (oldStatus === actualNewStatus) {
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
        }));

        // DRAFT/SCHEDULED -> COMPLETED
        if (
          (oldStatus === 'DRAFT' || oldStatus === 'SCHEDULED') &&
          actualNewStatus === 'COMPLETED'
        ) {
          // 1. Apply Inventory Movements
          await this.applyInventoryMovements(tx, purchase, items);

          // 2. Check if we need reprocessing (Backdated)
          // For now, we always trigger reprocessing for the affected products
          // to ensure the ledger remains consistent if this was a backdated entry.
          productsToReprocess = items.map((i) => i.productId);
        }

        // COMPLETED -> DRAFT (or CANCELLED or SCHEDULED)
        // Revert the purchase (decrease stock)
        if (
          oldStatus === 'COMPLETED' &&
          (actualNewStatus === 'DRAFT' ||
            actualNewStatus === 'CANCELLED' ||
            actualNewStatus === 'SCHEDULED')
        ) {
          // Check for negative stock before reverting
          await this.inventoryService.validateRevertVisibility(tx, purchase.storeId, items);

          // Apply revert (negative quantity)
          const revertItems = items.map((i) => ({
            ...i,
            quantity: i.quantity.negated(),
            total: i.total.negated(),
          }));

          await this.inventoryService.applyMovements(
            tx,
            {
              storeId: purchase.storeId,
              type: 'PURCHASE',
              date: purchase.date ?? new Date(),
              documentId: purchase.id ?? '',
              reason: 'REVERSAL',
            },
            revertItems,
            'IN',
          );

          // ALWAYS trigger reprocessing for REVERT because it changes historical state
          productsToReprocess = items.map((i) => i.productId);
        }

        // Update status
        const updatedDoc = await tx.documentPurchase.update({
          where: { id },
          data: { status: actualNewStatus },
          include: { items: true, revaluation: true },
        });

        await this.ledgerService.logAction(tx, {
          documentId: id,
          documentType: 'documentPurchase',
          action: 'STATUS_CHANGED',
          details: { from: oldStatus, to: newStatus },
          authorId: userId,
        });

        // ---------------------------------------------

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
          updatedPurchase.storeId,
          productId,
          updatedPurchase.date,
          id, // use document ID as causationId
        );
      }
    }

    return updatedPurchase;
  }

  async addItems(
    id: string,
    itemsDto: CreateDocumentPurchaseItemDto[],
    userId?: string,
  ): Promise<DocumentPurchase> {
    return this.prisma.$transaction(
      async (tx) => {
        const doc = await tx.documentPurchase.findUniqueOrThrow({
          where: { id },
          include: { items: true },
        });

        this.baseService.ensureDraft(doc.status);

        let totalAddition = new Decimal(0);

        for (const itemDto of itemsDto) {
          const quantity = new Decimal(itemDto.quantity);
          const price = new Decimal(itemDto.price);
          const total = quantity.mul(price);
          totalAddition = totalAddition.add(total);

          await tx.documentPurchaseItem.create({
            data: {
              purchaseId: id,
              productId: itemDto.productId,
              quantity,
              price,
              total,
            },
          });

          // Log Action
          await this.ledgerService.logAction(tx, {
            documentId: id,
            documentType: 'documentPurchase',
            action: 'ITEM_ADDED',
            details: {
              productId: itemDto.productId,
              quantity,
              price,
              total,
            },
            authorId: userId,
          });
        }

        // Update Document Total
        const newTotal = new Decimal(doc.total).add(totalAddition);
        await tx.documentPurchase.update({
          where: { id },
          data: { total: newTotal },
        });

        // Fetch freshly created items to ensure we have correct state for sync
        const currentItems = await tx.documentPurchaseItem.findMany({
          where: { purchaseId: id },
        });

        // Sync Price Changes with ALL items
        // Load existing DocumentRevaluation to preserve newPrices from previous items
        const existingRevaluation = await tx.documentRevaluation.findUnique({
          where: { documentPurchaseId: id },
          include: { items: true },
        });

        // Reconstruct newPrices for existing items from DocumentRevaluation
        const existingNewPricesMap = new Map<string, UpdateProductPriceDto[]>();
        if (existingRevaluation) {
          for (const priceItem of existingRevaluation.items) {
            if (!existingNewPricesMap.has(priceItem.productId)) {
              existingNewPricesMap.set(priceItem.productId, []);
            }
            existingNewPricesMap.get(priceItem.productId)!.push({
              priceTypeId: priceItem.priceTypeId,
              value: priceItem.newValue.toNumber(),
            });
          }
        }

        // Overlay new prices from the current DTOs
        for (const dto of itemsDto) {
          if (dto.newPrices) {
            existingNewPricesMap.set(dto.productId, dto.newPrices);
          }
        }

        // Map items to PreparedPurchaseItem format
        const allItemsPrepared = currentItems.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          price: i.price,
          total: i.total,
          newPrices: existingNewPricesMap.get(i.productId) || [],
        }));

        await this.syncPriceChanges(tx, doc, allItemsPrepared);

        return tx.documentPurchase.findUniqueOrThrow({
          where: { id },
          include: {
            items: {
              include: {
                product: {
                  include: {
                    prices: true,
                  },
                },
              },
            },
            documentHistory: {
              orderBy: { createdAt: 'asc' },
            },
            vendor: true,
            store: true,
            revaluation: {
              include: {
                items: true,
              },
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
    itemDto: UpdateDocumentPurchaseItemDto,
    userId?: string,
  ): Promise<DocumentPurchase> {
    // Note: itemId is productId in the current DTO design, but usually it's a unique ID.
    // However, Prisma doesn't always expose IDs in DTOs easily if not asked.
    // Assuming itemId passed from FE is productId as per route param usage, OR it's a unique ID.
    // Let's assume it's productId based on REST conventions for sub-resources if they don't have global IDs.
    // BUT PurchaseItem usually has its own ID. Let's assume the controller passes productId for now if the DTO uses productId.
    // Actually, looking at the remove logic, we might need to find by productId if that's how we identify them.
    // Let's use productId for identification within the scope of a purchase.

    return this.prisma.$transaction(
      async (tx) => {
        const doc = await tx.documentPurchase.findUniqueOrThrow({
          where: { id },
          include: { items: true },
        });

        this.baseService.ensureDraft(doc.status);

        // Find existing item
        // Route param `itemId` is likely treated as `productId` if we don't expose internal IDs.
        // Let's assume itemId == productId for simplicity in this domain (unique per doc).
        const existingItem = doc.items.find((i) => i.productId === itemId);
        if (!existingItem) {
          // Fallback: maybe it IS a unique ID?
          // For now, let's try to match by productId as the primary key within the doc context usually.
          // Or we can query by ID directly if we know it.
          // Let's Stick to productId matching for consistent API usage.
          throw new BadRequestException('Товар не найден в документе');
        }

        const quantity =
          itemDto.quantity !== undefined ? new Decimal(itemDto.quantity) : existingItem.quantity;
        const price = itemDto.price !== undefined ? new Decimal(itemDto.price) : existingItem.price;
        const total = quantity.mul(price);

        // Update Item
        await tx.documentPurchaseItem.update({
          where: { id: existingItem.id },
          data: {
            quantity,
            price,
            total,
          },
        });

        // Recalculate Document Total
        // We can do this efficiently by subtract old, add new.
        const newDocTotal = new Decimal(doc.total).sub(existingItem.total).add(total);
        await tx.documentPurchase.update({
          where: { id },
          data: { total: newDocTotal },
        });

        // Log Diff
        await this.ledgerService.logDiff(
          tx,
          { documentId: id, documentType: 'documentPurchase', authorId: userId },
          [
            {
              productId: existingItem.productId,
              quantity: existingItem.quantity,
              price: existingItem.price,
            },
          ],
          [{ productId: itemDto.productId || existingItem.productId, quantity, price }],
          ['quantity', 'price'],
        );

        // Sync Price Changes
        // Construct new items list for sync
        const updatedItems = doc.items.map((i) =>
          i.productId === itemId ? { ...i, ...itemDto, quantity, price, total } : i,
        );
        if (itemDto.newPrices) {
          // Ensure compatibility if newPrices is present
        }
        await this.syncPriceChanges(tx, doc, updatedItems);

        return tx.documentPurchase.findUniqueOrThrow({
          where: { id },
          include: {
            items: {
              include: {
                product: {
                  include: {
                    prices: true,
                  },
                },
              },
            },
            documentHistory: {
              orderBy: { createdAt: 'asc' },
            },
            vendor: true,
            store: true,
            revaluation: {
              include: {
                items: true,
              },
            },
          },
        });
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }

  async removeItems(id: string, productIds: string[], userId?: string): Promise<DocumentPurchase> {
    return this.prisma.$transaction(
      async (tx) => {
        const doc = await tx.documentPurchase.findUniqueOrThrow({
          where: { id },
          include: { items: true },
        });

        this.baseService.ensureDraft(doc.status);

        let totalSubtraction = new Decimal(0);

        for (const productId of productIds) {
          const existingItem = doc.items.find((i) => i.productId === productId);
          if (!existingItem) {
            throw new BadRequestException(`Товар с ID ${productId} не найден в документе`);
          }

          await tx.documentPurchaseItem.delete({
            where: { id: existingItem.id },
          });

          totalSubtraction = totalSubtraction.add(existingItem.total);

          await this.ledgerService.logAction(tx, {
            documentId: id,
            documentType: 'documentPurchase',
            action: 'ITEM_REMOVED',
            details: {
              productId,
              quantity: existingItem.quantity,
              price: existingItem.price,
              total: existingItem.total,
            },
            authorId: userId,
          });
        }

        const newTotal = new Decimal(doc.total).sub(totalSubtraction);
        await tx.documentPurchase.update({
          where: { id },
          data: { total: newTotal },
        });

        // Sync Price Changes
        const updatedItems = doc.items.filter((i) => !productIds.includes(i.productId));
        await this.syncPriceChanges(tx, doc, updatedItems);

        return tx.documentPurchase.findUniqueOrThrow({
          where: { id },
          include: {
            items: {
              include: {
                product: {
                  include: {
                    prices: true,
                  },
                },
              },
            },
            documentHistory: {
              orderBy: { createdAt: 'asc' },
            },
            vendor: true,
            store: true,
            revaluation: {
              include: {
                items: true,
              },
            },
          },
        });
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }

  // Refactored monolithic update (kept for header updates)
  async update(id: string, updateDto: UpdateDocumentPurchaseDto): Promise<DocumentPurchase> {
    return this.prisma.$transaction(
      async (tx) => {
        const doc = await tx.documentPurchase.findUniqueOrThrow({
          where: { id },
          include: { items: true },
        });

        this.baseService.ensureDraft(doc.status);

        const { storeId, vendorId, date, notes } = updateDto;
        const docDate = date ? new Date(date) : undefined;

        // Update Document Header
        const updatedDoc = await tx.documentPurchase.update({
          where: { id },
          data: {
            storeId,
            vendorId,
            date: docDate,
            notes,
          },
          include: { items: true },
        });

        // Log Header Changes
        const headerChanges: Record<string, unknown> = {};
        if (notes !== undefined && notes !== (doc.notes ?? '')) headerChanges.notes = notes;
        if (storeId !== undefined && storeId !== doc.storeId) headerChanges.storeId = storeId;
        if (vendorId !== undefined && vendorId !== doc.vendorId) headerChanges.vendorId = vendorId;
        if (date && new Date(date).getTime() !== new Date(doc.date).getTime())
          headerChanges.date = date;

        if (Object.keys(headerChanges).length > 0) {
          await this.ledgerService.logAction(tx, {
            documentId: id,
            documentType: 'documentPurchase',
            action: 'UPDATED',
            details: headerChanges,
          });
        }

        // Items are NOT updated here anymore in the granular approach.
        // If items are passed, we could optionally handle them, but for cleaner API,
        // we assume items are handled via sub-resources or we can delegate if we really want to support bulk update.
        // For now, let's assume this method is ONLY for header updates as per user request for granular logic.
        // BUT to be safe and backward compatible or "Save All" compatible if needed:

        // We can implement full sync here if needed, or throw error "Use granular endpoints".
        // Given the user wants to split logic, let's perform full sync here reusing our helpers
        // if we wanted to keep "Save All", but arguably we should strip it down.
        // However, if the CLI "Update" which might send everything will break.
        // Let's implement full sync using the logic we extracted effectively.
        // Legacy "Sync" logic (optional, for backward compat or bulk save)
        // If we strictly follow granular, we ignore items here.
        // Let's keep it simple: Update header only.
        // If the user wants to update items, they use the item endpoints.

        return updatedDoc;
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }

  // Helper for Price Change Sync (shared)
  private async syncPriceChanges(
    tx: Prisma.TransactionClient,
    purchase: { id: string; code: string; date: Date },
    items: {
      productId: string;
      quantity: Decimal | number;
      price: Decimal | number;
      total: Decimal | number;
      newPrices?: UpdateProductPriceDto[];
    }[],
  ): Promise<void> {
    // Reuse existing handlePriceChanges logic, but adapt it to be cleaner if needed.
    // For now, mapping to PreparedPurchaseItem structure.
    const prepared: PreparedPurchaseItem[] = items.map((i) => ({
      productId: i.productId,
      quantity: new Decimal(i.quantity),
      price: new Decimal(i.price),
      total: new Decimal(i.total),
      newPrices: i.newPrices,
    }));
    await this.handlePriceChanges(tx, purchase.id, purchase.code, purchase.date, prepared);
  }

  findAll(): Promise<DocumentPurchase[]> {
    return this.prisma.documentPurchase.findMany({
      include: {
        store: true,
        vendor: true,
        revaluation: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  findOne(id: string): Promise<DocumentPurchase> {
    return this.prisma.documentPurchase.findUniqueOrThrow({
      where: { id },
      include: {
        items: {
          include: {
            product: {
              include: {
                prices: true,
                revaluationItems: true,
              },
            },
          },
        },
        documentHistory: {
          orderBy: { createdAt: 'asc' },
        },
        vendor: true,
        store: true,
        revaluation: {
          include: {
            items: true,
          },
        },
      },
    });
  }

  private async applyInventoryMovements(
    tx: Prisma.TransactionClient,
    purchase: PurchaseContext,
    items: PreparedPurchaseItem[],
  ): Promise<void> {
    await this.inventoryService.applyMovements(
      tx,
      {
        storeId: purchase.storeId,
        type: 'PURCHASE',
        date: purchase.date ?? new Date(),
        documentId: purchase.id ?? '',
      },
      items,
      'IN',
    );
  }

  private async handlePriceChanges(
    tx: Prisma.TransactionClient,
    purchaseId: string,
    purchaseCode: string,
    date: Date,
    items: PreparedPurchaseItem[],
  ): Promise<void> {
    const itemsWithNewPrices = items.filter((i) => i.newPrices && i.newPrices.length > 0);

    if (itemsWithNewPrices.length === 0) {
      return;
    }

    // Flatten all price updates into a single list
    const priceChangeItems: {
      productId: string;
      priceTypeId: string;
      newValue: Decimal;
      oldValue: number | Decimal;
    }[] = [];

    for (const item of itemsWithNewPrices) {
      for (const priceUpdate of item.newPrices!) {
        const currentPrice = await tx.price.findUnique({
          where: {
            productId_priceTypeId: {
              productId: item.productId,
              priceTypeId: priceUpdate.priceTypeId,
            },
          },
        });

        const oldValue = currentPrice?.value ? new Decimal(currentPrice.value) : new Decimal(0);
        const newValue = new Decimal(priceUpdate.value);

        // Filter out identical prices
        if (!oldValue.equals(newValue)) {
          priceChangeItems.push({
            productId: item.productId,
            priceTypeId: priceUpdate.priceTypeId,
            newValue,
            oldValue,
          });
        }
      }
    }

    if (priceChangeItems.length === 0) {
      return;
    }

    // Check for existing linked document
    const existing = await tx.documentRevaluation.findUnique({
      where: { documentPurchaseId: purchaseId },
    });

    if (existing) {
      // If it exists, add new items (or ignore if they are already there)
      // For simplicity in automatic mode, we just append new items
      await tx.documentRevaluationItem.createMany({
        data: priceChangeItems.map((item) => ({
          ...item,
          documentId: existing.id,
        })),
      });

      // Log the addition
      await this.ledgerService.logAction(tx, {
        documentId: existing.id,
        documentType: 'documentRevaluation',
        action: 'ITEM_ADDED',
        details: {
          count: priceChangeItems.length,
          items: priceChangeItems.map((i) => i.productId),
        },
      });
      return;
    }

    // Generate code for DocumentRevaluation
    const revaluationCode = await this.codeGenerator.getNextRevaluationCode();

    // Create the new linked Revaluation Document
    const rvDoc = await tx.documentRevaluation.create({
      data: {
        code: revaluationCode,
        date,
        status: 'DRAFT',
        notes: `Автоматически создан на основе закупки №${purchaseCode}`,
        documentPurchaseId: purchaseId,
        items: {
          create: priceChangeItems,
        },
      },
    });

    // Log the creation in DocumentHistory
    await this.ledgerService.logAction(tx, {
      documentId: rvDoc.id,
      documentType: 'documentRevaluation',
      action: 'CREATED',
      details: {
        status: 'DRAFT',
        notes: rvDoc.notes,
        isAutomatic: true,
        sourceCode: purchaseCode,
        sourceType: 'documentPurchase',
      },
    });
  }
}
