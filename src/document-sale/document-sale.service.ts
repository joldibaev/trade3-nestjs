import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import { InventoryService } from '../core/inventory/inventory.service';
import { Prisma } from '../generated/prisma/client';
import { DocumentStatus } from '../generated/prisma/enums';
import { CreateDocumentSaleDto } from './dto/create-document-sale.dto';
import { StoreService } from '../store/store.service';
import { DocumentLedgerService } from '../document-ledger/document-ledger.service';
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
    private readonly ledgerService: DocumentLedgerService,
    private readonly baseService: BaseDocumentService,
    private readonly codeGenerator: CodeGeneratorService,
  ) {}

  async create(createDocumentSaleDto: CreateDocumentSaleDto) {
    const { storeId, cashboxId, clientId, date, status, priceTypeId, items, notes } =
      createDocumentSaleDto;

    let targetStatus = status || 'DRAFT';
    const safeItems = items || [];
    const docDate = date ? new Date(date) : new Date();

    // Auto-schedule if date is in the future
    if (targetStatus === 'COMPLETED' && docDate > new Date()) {
      (targetStatus as any) = 'SCHEDULED';
    }

    // 1. Validate Store
    await this.storeService.validateStore(storeId);

    // 2. Prepare Items (Fetch Products & Calculate Prices)
    const productIds = safeItems.map((i) => i.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      include: { prices: true },
    });

    const productsMap = new Map(products.map((p) => [p.id, p]));
    const preparedItems: {
      productId: string;
      quantity: Decimal;
      price: Decimal;
      total: Decimal;
    }[] = [];
    let total = new Decimal(0);

    for (const item of safeItems) {
      const product = productsMap.get(item.productId);
      if (!product) {
        throw new NotFoundException(`Товар ${item.productId} не найден`);
      }

      let finalPrice = new Decimal(item.price ?? 0);
      if (item.price === undefined) {
        if (priceTypeId) {
          const priceObj = product.prices.find((p) => p.priceTypeId === priceTypeId);
          finalPrice = priceObj ? priceObj.value : new Decimal(0);
        } else {
          // Default to first available price
          finalPrice = product.prices[0] ? product.prices[0].value : new Decimal(0);
        }
      }

      const quantity = new Decimal(item.quantity);
      const itemTotal = finalPrice.mul(quantity);
      total = total.add(itemTotal);

      preparedItems.push({
        productId: item.productId,
        quantity,
        price: finalPrice,
        total: itemTotal,
      });
    }

    // 3. Execute Transaction
    const result = await this.prisma.$transaction(
      async (tx) => {
        // Fetch all relevant stocks in one go
        const stocks = await tx.stock.findMany({
          where: {
            storeId,
            productId: { in: productIds },
          },
        });
        const stockMap = new Map(stocks.map((s) => [s.productId, s]));

        // ACQUIRE LOCKS for all products involved in this sale
        // Sort IDs to avoid deadlocks
        const sortedProductIds = [...productIds].sort();
        for (const pid of sortedProductIds) {
          await this.inventoryService.lockProduct(tx, storeId, pid);
        }

        const documentItemsData: {
          productId: string;
          quantity: Decimal;
          price: Decimal;
          costPrice: Decimal;
          total: Decimal;
        }[] = [];

        for (const item of preparedItems) {
          const stock = stockMap.get(item.productId);
          const currentQty = stock ? stock.quantity : new Decimal(0);
          const costPrice = stock ? stock.averagePurchasePrice : new Decimal(0);

          // Validate Stock Availability only if status is COMPLETED
          if (targetStatus === 'COMPLETED') {
            if (currentQty.lessThan(item.quantity)) {
              throw new BadRequestException(
                `Недостаточно остатка для товара ${item.productId}. Доступно: ${currentQty.toString()}, Запрошено: ${item.quantity.toString()}`,
              );
            }
          }

          documentItemsData.push({
            productId: item.productId,
            quantity: item.quantity,
            price: item.price,
            costPrice,
            total: item.total,
          });
        }

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
            total,
            items: {
              create: documentItemsData,
            },
          },
          include: { items: true },
        });

        // Update Stock if COMPLETED
        let reprocessingId: string | null = null;
        if (sale.status === 'COMPLETED' && preparedItems.length > 0) {
          await this.applyInventoryMovements(tx, sale, preparedItems);

          reprocessingId = await this.inventoryService.triggerReprocessingIfNeeded(tx, {
            storeId,
            productId: productIds,
            date: docDate,
            documentId: sale.id,
            documentType: 'documentSale',
          });
        }

        return { sale, reprocessingId };
      },
      {
        isolationLevel: 'ReadCommitted',
      },
    );

    // POST-TRANSACTION: Reprocess History
    if (result.reprocessingId) {
      for (const item of result.sale.items) {
        await this.inventoryService.reprocessProductHistory(
          result.sale.storeId,
          item.productId,
          result.sale.date,
          result.reprocessingId,
        );
      }
      await this.inventoryService.completeReprocessing(result.reprocessingId);
    }

    return result.sale;
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
          (actualNewStatus as any) = 'SCHEDULED';
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
        isolationLevel: 'Serializable',
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

  async update(id: string, updateDto: CreateDocumentSaleDto) {
    return this.prisma.$transaction(
      async (tx) => {
        const sale = await tx.documentSale.findUniqueOrThrow({
          where: { id },
          include: { items: true },
        });

        this.baseService.ensureDraft(sale.status);

        const { storeId, cashboxId, clientId, date, priceTypeId, items, notes } = updateDto;
        const docDate = date ? new Date(date) : new Date();
        const safeItems = items || [];

        // 1. Prepare new Items
        const productIds = safeItems.map((i) => i.productId);

        const products = await tx.product.findMany({
          where: { id: { in: productIds } },
          include: { prices: true },
        });
        const productsMap = new Map(products.map((p) => [p.id, p]));

        const preparedItems: {
          productId: string;
          quantity: Decimal;
          price: Decimal;
          total: Decimal;
        }[] = [];
        let total = new Decimal(0);

        for (const item of safeItems) {
          const product = productsMap.get(item.productId);
          if (!product) {
            throw new NotFoundException(`Товар ${item.productId} не найден`);
          }

          let finalPrice = new Decimal(item.price ?? 0);
          if (item.price === undefined) {
            if (priceTypeId) {
              const priceObj = product.prices.find((p) => p.priceTypeId === priceTypeId);
              finalPrice = priceObj ? priceObj.value : new Decimal(0);
            } else {
              finalPrice = product.prices[0] ? product.prices[0].value : new Decimal(0);
            }
          }

          const quantity = new Decimal(item.quantity);
          const itemTotal = finalPrice.mul(quantity);
          total = total.add(itemTotal);

          preparedItems.push({
            productId: item.productId,
            quantity,
            price: finalPrice,
            total: itemTotal,
          });
        }

        // 2. Delete existing items
        await tx.documentSaleItem.deleteMany({
          where: { saleId: id },
        });

        // 3. Update Document
        const updatedSale = await tx.documentSale.update({
          where: { id },
          data: {
            storeId,
            cashboxId,
            clientId,
            date: docDate,
            priceTypeId,
            notes,
            total,
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

        // Log Update (notes etc)
        const changes: Record<string, any> = {};
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

        // Log Diffs
        const oldItems = sale.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          price: item.price,
        }));

        await this.ledgerService.logDiff(
          tx,
          {
            documentId: id,
            documentType: 'documentSale',
          },
          oldItems,
          preparedItems,
          ['quantity', 'price'],
        );

        return updatedSale;
      },
      {
        isolationLevel: 'ReadCommitted',
      },
    );
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
        documentLedger: {
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
