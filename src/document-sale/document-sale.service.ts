import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import { InventoryService } from '../core/inventory/inventory.service';
import { Prisma } from '../generated/prisma/client';
import { DocumentStatus } from '../generated/prisma/enums';
import { CreateDocumentSaleDto } from './dto/create-document-sale.dto';
import { CreateDocumentSaleItemDto } from './dto/create-document-sale-item.dto';
import { UpdateDocumentSaleItemDto } from './dto/update-document-sale-item.dto';
import { StoreService } from '../store/store.service';
import { DocumentHistoryService } from '../document-history/document-history.service';
import { BaseDocumentService } from '../common/base-document.service';
import { CodeGeneratorService } from '../core/code-generator/code-generator.service';
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

  async create(createDocumentSaleDto: CreateDocumentSaleDto) {
    const { storeId, cashboxId, clientId, date, status, priceTypeId, notes } =
      createDocumentSaleDto;

    let targetStatus = status || 'DRAFT';
    const docDate = date ? new Date(date) : new Date();

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

    return result;
  }

  async update(id: string, updateDto: CreateDocumentSaleDto) {
    return this.prisma.$transaction(
      async (tx) => {
        const sale = await tx.documentSale.findUniqueOrThrow({
          where: { id },
        });

        this.baseService.ensureDraft(sale.status);

        const { storeId, cashboxId, clientId, date, priceTypeId, notes } = updateDto;
        const docDate = date ? new Date(date) : new Date();

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

  async addItems(id: string, itemsDto: CreateDocumentSaleItemDto[]) {
    return this.prisma.$transaction(
      async (tx) => {
        const sale = await tx.documentSale.findUniqueOrThrow({
          where: { id },
        });

        this.baseService.ensureDraft(sale.status);

        let totalAddition = new Decimal(0);

        for (const dto of itemsDto) {
          const { productId, quantity } = dto;
          if (!productId) {
            throw new BadRequestException('ID товара обязателен');
          }

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

          const qVal = new Decimal(quantity);
          const itemTotal = qVal.mul(finalPrice);
          totalAddition = totalAddition.add(itemTotal);

          // Fetch current cost price for snapshot
          const stock = await tx.stock.findUnique({
            where: { productId_storeId: { productId: productId, storeId: sale.storeId } },
          });
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

        await tx.documentSale.update({
          where: { id },
          data: { total: { increment: totalAddition } },
        });

        // Use tx context for findOne if needed, but since it's read-only and transaction will commit,
        // we can fetch it after or inside. Let's do it inside using tx.
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

  async updateItem(id: string, itemId: string, dto: UpdateDocumentSaleItemDto) {
    return this.prisma.$transaction(
      async (tx) => {
        const sale = await tx.documentSale.findUniqueOrThrow({
          where: { id },
        });

        this.baseService.ensureDraft(sale.status);

        const item = await tx.documentSaleItem.findUniqueOrThrow({
          where: { id: itemId },
        });

        const { quantity, price } = dto;
        const qVal = quantity !== undefined ? new Decimal(quantity) : item.quantity;
        const pVal = price !== undefined ? new Decimal(price) : item.price;
        const newTotal = qVal.mul(pVal);
        const amountDiff = newTotal.sub(item.total);

        const _updatedItem = await tx.documentSaleItem.update({
          where: { id: itemId },
          data: {
            quantity: qVal,
            price: pVal,
            total: newTotal,
          },
        });

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

  async removeItems(id: string, itemIds: string[]) {
    return this.prisma.$transaction(
      async (tx) => {
        const sale = await tx.documentSale.findUniqueOrThrow({
          where: { id },
        });

        this.baseService.ensureDraft(sale.status);

        let totalSubtraction = new Decimal(0);

        for (const itemId of itemIds) {
          const item = await tx.documentSaleItem.findUniqueOrThrow({
            where: { id: itemId },
          });

          await tx.documentSaleItem.delete({
            where: { id: itemId },
          });

          totalSubtraction = totalSubtraction.add(item.total);

          await this.ledgerService.logAction(tx, {
            documentId: id,
            documentType: 'documentSale',
            action: 'ITEM_REMOVED',
            details: { productId: item.productId, quantity: item.quantity, total: item.total },
          });
        }

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

  async updateStatus(id: string, newStatus: DocumentStatus) {
    let reprocessingId: string | null = null;
    let productsToReprocess: string[] = [];

    const updatedSale = await this.prisma.$transaction(
      async (tx) => {
        const sale = await tx.documentSale.findUniqueOrThrow({
          where: { id },
          include: { items: true },
        });

        // ACQUIRE LOCKS for all products involved
        const productIds = sale.items.map((i) => i.productId);
        const sortedProductIds = [...new Set(productIds)].sort(); // Unique and Sorted
        for (const pid of sortedProductIds) {
          await this.inventoryService.lockProduct(tx, sale.storeId, pid);
        }

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
          // 1. Update items with CURRENT cost price before completing
          await this.updateItemCostPrices(tx, sale);

          // 2. Apply stock movements (Decrease Stock)
          await this.applyInventoryMovements(tx, sale, items);

          // 3. Check for backdated reprocessing
          reprocessingId = await this.inventoryService.triggerReprocessingIfNeeded(tx, {
            storeId: sale.storeId,
            productId: productIds,
            date: sale.date,
            documentId: sale.id,
            documentType: 'documentSale',
          });
          if (reprocessingId) {
            productsToReprocess = productIds;
          }
        }

        // COMPLETED -> DRAFT (or CANCELLED or SCHEDULED)
        if (
          oldStatus === 'COMPLETED' &&
          (actualNewStatus === 'DRAFT' ||
            actualNewStatus === 'CANCELLED' ||
            actualNewStatus === 'SCHEDULED')
        ) {
          // Revert stock (Increase Stock)
          const revertItems = items.map((i) => ({
            ...i,
            quantity: i.quantity.negated(),
          }));

          await this.applyInventoryMovements(tx, sale, revertItems);

          // ALWAYS trigger reprocessing for REVERT
          const reprocessing = await tx.inventoryReprocessing.create({
            data: {
              status: 'PENDING',
              documentSaleId: sale.id,
              date: sale.date,
            },
          });
          reprocessingId = reprocessing.id;
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
    if (reprocessingId && productsToReprocess.length > 0) {
      for (const pid of productsToReprocess) {
        await this.inventoryService.reprocessProductHistory(
          updatedSale.storeId,
          pid,
          updatedSale.date,
          reprocessingId,
        );
      }
      await this.inventoryService.completeReprocessing(reprocessingId);
    }

    return updatedSale;
  }

  private async updateItemCostPrices(tx: Prisma.TransactionClient, sale: SaleWithItems) {
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

  findAll() {
    return this.prisma.documentSale.findMany({
      include: { store: true, client: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getSummary() {
    const where: Prisma.DocumentSaleWhereInput = {};

    const [aggregate, totalCount] = await Promise.all([
      this.prisma.documentSale.aggregate({
        where,
        _sum: { total: true },
      }),
      this.prisma.documentSale.count({ where }),
    ]);

    const completedCount = await this.prisma.documentSale.count({
      where: {
        ...where,
        status: 'COMPLETED',
      },
    });

    return {
      totalAmount: aggregate._sum.total?.toNumber() || 0,
      totalCount,
      completedCount,
    };
  }

  findOne(id: string) {
    return this.prisma.documentSale.findUniqueOrThrow({
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
  }

  private async applyInventoryMovements(
    tx: Prisma.TransactionClient,
    sale: SaleMinimal,
    items: PreparedSaleItem[],
  ) {
    await this.inventoryService.applyMovements(
      tx,
      {
        storeId: sale.storeId,
        type: 'SALE',
        date: sale.date ?? new Date(),
        documentId: sale.id ?? '',
      },
      items,
      'OUT',
    );
  }
}
