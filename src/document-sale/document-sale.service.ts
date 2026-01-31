import { BadRequestException, Injectable } from '@nestjs/common';

import { CodeGeneratorService } from '../code-generator/code-generator.service';
import { BaseDocumentService } from '../common/base-document.service';
import { DocumentHistoryService } from '../document-history/document-history.service';
import { DocumentSale, Prisma } from '../generated/prisma/client';
import { DocumentStatus, LedgerReason } from '../generated/prisma/enums';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import { StoreService } from '../store/store.service';
import { CreateDocumentSaleDto } from './dto/create-document-sale.dto';
import { CreateDocumentSaleItemDto } from './dto/create-document-sale-item.dto';
import { UpdateDocumentSaleItemDto } from './dto/update-document-sale-item.dto';
import Decimal = Prisma.Decimal;

interface PreparedSaleItem {
  productId: string;
  quantity: Decimal;
  price: Decimal;
}

interface SaleMinimal {
  id?: string;
  storeId: string;
  date?: Date;
}

interface SaleWithItems extends SaleMinimal {
  items: { id: string; productId: string }[];
}

@Injectable()
export class DocumentSaleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly storeService: StoreService,
    private readonly ledgerService: DocumentHistoryService,
    private readonly baseService: BaseDocumentService,
    private readonly codeGenerator: CodeGeneratorService,
  ) {}

  async create(createDocumentSaleDto: CreateDocumentSaleDto): Promise<DocumentSale> {
    const { storeId, cashboxId, clientId, date, status, priceTypeId, notes } =
      createDocumentSaleDto;

    let targetStatus = status || 'DRAFT';
    const docDate = date ? new Date(date) : new Date();

    // Auto-schedule if date is in the future
    if (targetStatus === 'COMPLETED' && docDate > new Date()) {
      targetStatus = 'SCHEDULED' as DocumentStatus;
    }

    // 1. Validate Store and Cashbox
    await this.storeService.validateStore(storeId);

    if (cashboxId) {
      const cashbox = await this.prisma.cashbox.findUnique({
        where: { id: cashboxId },
      });
      if (!cashbox) {
        throw new BadRequestException('Касса не найдена');
      }
      if (cashbox.storeId !== storeId) {
        throw new BadRequestException('Выбранная касса не принадлежит выбранному складу');
      }
    }

    // 2. Execute Transaction

    return this.prisma.$transaction(
      async (tx) => {
        // Generate Code
        const code = await this.codeGenerator.getNextSaleCode();

        // Create DocumentSale
        const sale = await tx.documentSale.create({
          data: {
            code,
            storeId,
            cashboxId,
            clientId,
            date: docDate,
            status: targetStatus,
            priceTypeId,
            notes,
            total: 0,
          },
        });

        await this.ledgerService.logAction(tx, {
          documentId: sale.id,
          documentType: 'documentSale',
          action: 'CREATED',
          details: { status: targetStatus, notes },
        });

        return sale;
      },
      {
        isolationLevel: 'ReadCommitted',
      },
    );
  }

  async update(id: string, updateDto: CreateDocumentSaleDto): Promise<DocumentSale> {
    return this.prisma.$transaction(
      async (tx) => {
        const sale = await tx.documentSale.findUniqueOrThrow({
          where: { id },
        });

        this.baseService.ensureDraft(sale.status);

        const { storeId, cashboxId, clientId, date, priceTypeId, notes } = updateDto;
        const docDate = date ? new Date(date) : new Date();

        if (storeId && storeId !== sale.storeId) {
          await this.storeService.validateStore(storeId);

          // Migrate Reservations
          const items = await tx.documentSaleItem.findMany({ where: { saleId: id } });
          if (items.length > 0) {
            const pIds = items.map((i) => i.productId);
            // Lock BOTH stores
            await this.inventoryService.lockInventory(
              tx,
              pIds.flatMap((pid) => [
                { storeId: sale.storeId, productId: pid },
                { storeId: storeId, productId: pid },
              ]),
            );

            const resItems = items.map((i) => ({ productId: i.productId, quantity: i.quantity }));
            // Release OLD
            await this.inventoryService.applyReservations(
              tx,
              sale.storeId,
              resItems.map((i) => ({ ...i, quantity: i.quantity.negated() })),
            );
            // Apply NEW
            await this.inventoryService.applyReservations(tx, storeId, resItems);
          }
        }

        if (cashboxId) {
          const cashbox = await tx.cashbox.findUnique({
            where: { id: cashboxId },
          });
          if (!cashbox) {
            throw new BadRequestException('Касса не найдена');
          }
          if (cashbox.storeId !== (storeId || sale.storeId)) {
            throw new BadRequestException('Выбранная касса не принадлежит выбранному складу');
          }
        }

        const updatedSale = await tx.documentSale.update({
          where: { id },
          data: {
            storeId,
            cashboxId,
            clientId,
            date: docDate,
            priceTypeId,
            notes,
          },
        });

        // Log Update
        const changes: Record<string, unknown> = {};
        if (notes !== undefined && notes !== (sale.notes ?? '')) {
          changes.notes = notes;
        }
        if (storeId !== sale.storeId) {
          changes.storeId = storeId;
        }
        if (clientId !== sale.clientId) {
          changes.clientId = clientId;
        }
        if (priceTypeId !== sale.priceTypeId) {
          changes.priceTypeId = priceTypeId;
        }
        if (date && new Date(date).getTime() !== sale.date?.getTime()) {
          changes.date = date;
        }

        if (Object.keys(changes).length > 0) {
          await this.ledgerService.logAction(tx, {
            documentId: id,
            documentType: 'documentSale',
            action: 'UPDATED',
            details: changes,
          });
        }

        return updatedSale;
      },
      {
        isolationLevel: 'ReadCommitted',
      },
    );
  }

  async addItems(id: string, itemsDto: CreateDocumentSaleItemDto[]): Promise<DocumentSale> {
    return this.prisma.$transaction(
      async (tx) => {
        const sale = await tx.documentSale.findUniqueOrThrow({
          where: { id },
        });

        this.baseService.ensureDraft(sale.status);

        // ACQUIRE LOCKS for all products involved
        const pIds = itemsDto.map((dto) => dto.productId);
        await this.inventoryService.lockInventory(
          tx,
          pIds.map((pid) => ({ storeId: sale.storeId, productId: pid })),
        );

        let totalAddition = new Decimal(0);
        const addedQuantities = new Map<string, Decimal>();

        for (const dto of itemsDto) {
          const { productId, quantity } = dto;
          if (!productId) {
            throw new BadRequestException('ID товара обязателен');
          }

          const qVal = new Decimal(quantity);

          // 1. Stock Validation (Phys - Reserved)
          const stock = await tx.stock.findUnique({
            where: { productId_storeId: { productId, storeId: sale.storeId } },
          });
          const physicalQty = stock?.quantity || new Decimal(0);
          const reservedQty = stock?.reserved || new Decimal(0);
          const availableToPromise = physicalQty.sub(reservedQty);

          // Track what we added in THIS loop too (if batch adding same product)
          const inThisBatch = addedQuantities.get(productId) || new Decimal(0);

          if (inThisBatch.add(qVal).gt(availableToPromise)) {
            throw new BadRequestException(
              `Недостаточно свободного товара на складе (в наличии: ${physicalQty.toString()}, из них забронировано: ${reservedQty.toString()}, доступно: ${availableToPromise.toString()}, пытаетесь добавить: ${qVal.toString()})`,
            );
          }

          addedQuantities.set(productId, inThisBatch.add(qVal));

          const product = await tx.product.findUniqueOrThrow({
            where: { id: productId },
            include: { prices: true },
          });
          let finalPrice = new Decimal(dto.price ?? 0);
          if (dto.price === undefined) {
            if (sale.priceTypeId) {
              const priceObj = product.prices.find((p) => p.priceTypeId === sale.priceTypeId);
              finalPrice = priceObj ? priceObj.value : new Decimal(0);
            } else {
              finalPrice = product.prices[0] ? product.prices[0].value : new Decimal(0);
            }
          }

          const itemTotal = qVal.mul(finalPrice);
          totalAddition = totalAddition.add(itemTotal);

          // Fetch current cost price for snapshot
          const costPrice = stock ? stock.averagePurchasePrice : new Decimal(0);

          await tx.documentSaleItem.create({
            data: {
              saleId: id,
              productId: productId,
              quantity: qVal,
              price: finalPrice,
              costPrice,
              total: itemTotal,
            },
          });

          await this.ledgerService.logAction(tx, {
            documentId: id,
            documentType: 'documentSale',
            action: 'ITEM_ADDED',
            details: { productId, quantity: qVal, price: finalPrice, total: itemTotal },
          });
        }

        // Apply Reservation to Stock table
        await this.inventoryService.applyReservations(
          tx,
          sale.storeId,
          Array.from(addedQuantities.entries()).map(([productId, quantity]) => ({
            productId,
            quantity,
          })),
        );

        await tx.documentSale.update({
          where: { id },
          data: { total: { increment: totalAddition } },
        });

        return tx.documentSale.findUniqueOrThrow({
          where: { id },
          include: {
            items: true,
            client: true,
            store: true,
            cashbox: true,
            priceType: true,
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
    dto: UpdateDocumentSaleItemDto,
  ): Promise<DocumentSale> {
    return this.prisma.$transaction(
      async (tx) => {
        const sale = await tx.documentSale.findUniqueOrThrow({
          where: { id },
        });

        this.baseService.ensureDraft(sale.status);

        const item = await tx.documentSaleItem.findUniqueOrThrow({
          where: { id: itemId },
        });

        // ACQUIRE LOCKS
        await this.inventoryService.lockInventory(tx, [
          { storeId: sale.storeId, productId: item.productId },
        ]);

        const { quantity, price } = dto;
        const qVal = quantity !== undefined ? new Decimal(quantity) : item.quantity;
        const qDelta = qVal.sub(item.quantity);

        if (qDelta.isPositive()) {
          const stock = await tx.stock.findUnique({
            where: { productId_storeId: { productId: item.productId, storeId: sale.storeId } },
          });
          const physicalQty = stock?.quantity || new Decimal(0);
          const reservedQty = stock?.reserved || new Decimal(0);
          const availableToPromise = physicalQty.sub(reservedQty);

          if (qDelta.gt(availableToPromise)) {
            throw new BadRequestException(
              `Недостаточно свободного товара на складе (в наличии: ${physicalQty.toString()}, из них забронировано: ${reservedQty.toString()}, доступно: ${availableToPromise.toString()}, пытаетесь добавить еще: ${qDelta.toString()})`,
            );
          }
        }

        const pVal = price !== undefined ? new Decimal(price) : item.price;
        const newTotal = qVal.mul(pVal);
        const amountDiff = newTotal.sub(item.total);

        await tx.documentSaleItem.update({
          where: { id: itemId },
          data: {
            quantity: qVal,
            price: pVal,
            total: newTotal,
          },
        });

        // Apply Reservation Delta
        await this.inventoryService.applyReservations(tx, sale.storeId, [
          { productId: item.productId, quantity: qDelta },
        ]);

        await tx.documentSale.update({
          where: { id },
          data: { total: { increment: amountDiff } },
        });

        await this.ledgerService.logAction(tx, {
          documentId: id,
          documentType: 'documentSale',
          action: 'ITEM_CHANGED',
          details: {
            productId: item.productId,
            oldQuantity: item.quantity,
            newQuantity: qVal,
            oldPrice: item.price,
            newPrice: pVal,
          },
        });

        return tx.documentSale.findUniqueOrThrow({
          where: { id },
          include: {
            items: true,
            client: true,
            store: true,
            cashbox: true,
            priceType: true,
            documentHistory: {
              orderBy: { createdAt: 'asc' },
            },
          },
        });
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }

  async removeItems(id: string, itemIds: string[]): Promise<DocumentSale> {
    return this.prisma.$transaction(
      async (tx) => {
        const sale = await tx.documentSale.findUniqueOrThrow({
          where: { id },
        });

        this.baseService.ensureDraft(sale.status);

        const itemsToRemove = await tx.documentSaleItem.findMany({
          where: { id: { in: itemIds } },
        });

        if (itemsToRemove.length === 0) return sale;

        // ACQUIRE LOCKS
        const pIdsToRemove = itemsToRemove.map((i) => i.productId);
        await this.inventoryService.lockInventory(
          tx,
          pIdsToRemove.map((pid) => ({ storeId: sale.storeId, productId: pid })),
        );

        let totalSubtraction = new Decimal(0);
        const removedQuantities = new Map<string, Decimal>();

        for (const item of itemsToRemove) {
          await tx.documentSaleItem.delete({
            where: { id: item.id },
          });

          totalSubtraction = totalSubtraction.add(item.total);

          const currentRemoved = removedQuantities.get(item.productId) || new Decimal(0);
          removedQuantities.set(item.productId, currentRemoved.add(item.quantity));

          await this.ledgerService.logAction(tx, {
            documentId: id,
            documentType: 'documentSale',
            action: 'ITEM_REMOVED',
            details: { productId: item.productId, quantity: item.quantity, total: item.total },
          });
        }

        // Release Reservation
        await this.inventoryService.applyReservations(
          tx,
          sale.storeId,
          Array.from(removedQuantities.entries()).map(([productId, quantity]) => ({
            productId,
            quantity: quantity.negated(),
          })),
        );

        await tx.documentSale.update({
          where: { id },
          data: { total: { decrement: totalSubtraction } },
        });

        return tx.documentSale.findUniqueOrThrow({
          where: { id },
          include: {
            items: true,
            client: true,
            store: true,
            cashbox: true,
            priceType: true,
            documentHistory: {
              orderBy: { createdAt: 'asc' },
            },
          },
        });
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }

  async updateStatus(id: string, newStatus: DocumentStatus): Promise<DocumentSale> {
    let productsToReprocess: string[] = [];

    const updatedSale = await this.prisma.$transaction(
      async (tx) => {
        const sale = await tx.documentSale.findUniqueOrThrow({
          where: { id },
          include: { items: true },
        });

        // ACQUIRE LOCKS for all products involved
        const productIds = sale.items.map((i) => i.productId);
        await this.inventoryService.lockInventory(
          tx,
          productIds.map((pid) => ({ storeId: sale.storeId, productId: pid })),
        );

        const oldStatus = sale.status;
        let actualNewStatus = newStatus;

        if (newStatus === 'COMPLETED' && sale.date > new Date()) {
          actualNewStatus = 'SCHEDULED' as DocumentStatus;
        }

        if (oldStatus === actualNewStatus) {
          return sale;
        }

        if (oldStatus === 'CANCELLED') {
          throw new BadRequestException('Нельзя изменить статус отмененного документа');
        }

        const items = sale.items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          price: i.price,
        }));

        // DRAFT/SCHEDULED -> COMPLETED
        if (
          (oldStatus === 'DRAFT' || oldStatus === 'SCHEDULED') &&
          actualNewStatus === 'COMPLETED'
        ) {
          // 1. Release Reservation (Decrease Reserved)
          await this.inventoryService.applyReservations(
            tx,
            sale.storeId,
            items.map((i) => ({ productId: i.productId, quantity: i.quantity.negated() })),
          );

          // 2. Update items with CURRENT cost price before completing
          await this.updateItemCostPrices(tx, sale);

          // 3. Apply stock movements (Decrease Physical Stock)
          await this.applyInventoryMovements(tx, sale, items, 'INITIAL');

          // 4. Check for backdated reprocessing
          productsToReprocess = productIds;
        }

        // COMPLETED -> DRAFT (or CANCELLED or SCHEDULED)
        if (
          oldStatus === 'COMPLETED' &&
          (actualNewStatus === 'DRAFT' ||
            actualNewStatus === 'CANCELLED' ||
            actualNewStatus === 'SCHEDULED')
        ) {
          // 1. Revert physical stock (Increase Physical Stock)
          const revertItems = items.map((i) => ({
            ...i,
            quantity: i.quantity.negated(),
          }));

          await this.applyInventoryMovements(tx, sale, revertItems, 'REVERSAL');

          // 2. If moving back to DRAFT or SCHEDULED, RESTORE reservation
          if (actualNewStatus === 'DRAFT' || actualNewStatus === 'SCHEDULED') {
            await this.inventoryService.applyReservations(
              tx,
              sale.storeId,
              items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
            );
          }

          // ALWAYS trigger reprocessing for REVERT
          productsToReprocess = productIds;
        }

        // Update status
        const updatedDoc = await tx.documentSale.update({
          where: { id },
          data: { status: actualNewStatus },
          include: { items: true },
        });

        await this.ledgerService.logAction(tx, {
          documentId: id,
          documentType: 'documentSale',
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
      for (const pid of productsToReprocess) {
        await this.inventoryService.reprocessProductHistory(
          updatedSale.storeId,
          pid,
          updatedSale.date,
          id, // use document ID as causationId
        );
      }
    }

    return updatedSale;
  }

  private async updateItemCostPrices(
    tx: Prisma.TransactionClient,
    sale: SaleWithItems,
  ): Promise<void> {
    const productIds = sale.items.map((i) => i.productId);
    const stocks = await tx.stock.findMany({
      where: {
        storeId: sale.storeId,
        productId: { in: productIds },
      },
    });
    const stockMap = new Map(stocks.map((s) => [s.productId, s]));

    for (const item of sale.items) {
      const stock = stockMap.get(item.productId);
      const costPrice = stock ? stock.averagePurchasePrice : new Decimal(0);

      await tx.documentSaleItem.update({
        where: { id: item.id },
        data: { costPrice },
      });
    }
  }

  findAll(): Promise<DocumentSale[]> {
    return this.prisma.documentSale.findMany({
      include: { store: true, client: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  findOne(id: string): Promise<DocumentSale> {
    return this.prisma.documentSale.findUniqueOrThrow({
      where: { id },
      include: {
        items: {
          include: { product: true },
        },
        client: true,
        store: true,
        cashbox: true,
        priceType: true,
        documentHistory: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  private async applyInventoryMovements(
    tx: Prisma.TransactionClient,
    sale: SaleMinimal,
    items: PreparedSaleItem[],
    reason: LedgerReason = 'INITIAL',
  ): Promise<void> {
    await this.inventoryService.applyMovements(
      tx,
      {
        storeId: sale.storeId,
        type: 'SALE',
        date: sale.date ?? new Date(),
        documentId: sale.id ?? '',
        reason,
      },
      items,
      'OUT',
    );
  }
}
