import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import { InventoryService } from '../core/inventory/inventory.service';
import { Prisma } from '../generated/prisma/client';
import { CreateDocumentTransferDto } from './dto/create-document-transfer.dto';
import { StoreService } from '../store/store.service';
import { StockLedgerService } from '../stock-ledger/stock-ledger.service';
import { DocumentLedgerService } from '../document-ledger/document-ledger.service';
import { BaseDocumentService } from '../common/base-document.service';
import Decimal = Prisma.Decimal;

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
    private readonly storeService: StoreService,
    private readonly stockLedgerService: StockLedgerService,
    private readonly ledgerService: DocumentLedgerService,
    private readonly baseService: BaseDocumentService,
  ) {}

  async create(createDocumentTransferDto: CreateDocumentTransferDto) {
    const { sourceStoreId, destinationStoreId, date, status, items, notes } =
      createDocumentTransferDto;

    let targetStatus = status || 'DRAFT';
    const docDate = date ? new Date(date) : new Date();

    if (targetStatus === 'COMPLETED' && docDate > new Date()) {
      (targetStatus as any) = 'SCHEDULED';
    }
    const safeItems = items || [];

    if (sourceStoreId === destinationStoreId) {
      throw new BadRequestException('Склад отправителя и получателя должны отличаться');
    }

    // 1. Validate Stores
    // Use concurrent validation
    await Promise.all([
      this.storeService.validateStore(sourceStoreId).catch(() => {
        throw new NotFoundException('Склад отправителя не найден');
      }),
      this.storeService.validateStore(destinationStoreId).catch(() => {
        throw new NotFoundException('Склад получателя не найден');
      }),
    ]);

    // Prepare Items
    const productIds = safeItems.map((i) => i.productId);
    const preparedItems = safeItems.map((item) => ({
      productId: item.productId,
      quantity: new Decimal(item.quantity),
    }));

    const result = await this.prisma.$transaction(
      async (tx) => {
        // 4. Create Document
        const doc = await tx.documentTransfer.create({
          data: {
            sourceStoreId,
            destinationStoreId,
            date: docDate,
            status: targetStatus,
            notes,
            items: {
              create: preparedItems.map((i) => ({
                productId: i.productId,
                quantity: i.quantity,
              })),
            },
          },
          include: { items: true },
        });

        // Log CREATED
        await this.ledgerService.logAction(tx, {
          documentId: doc.id,
          documentType: 'documentTransfer',
          action: 'CREATED',
          details: { status: targetStatus, notes },
        });

        for (const item of preparedItems) {
          await this.ledgerService.logAction(tx, {
            documentId: doc.id,
            documentType: 'documentTransfer',
            action: 'ITEM_ADDED',
            details: {
              productId: item.productId,
              quantity: item.quantity,
            },
          });
        }

        let reprocessingId: string | null = null;
        if (targetStatus === 'COMPLETED' && preparedItems.length > 0) {
          await this.applyInventoryMovements(tx, doc, preparedItems);

          // Check if we need reprocessing in EITHER store
          const hasSourceHistory = await tx.stockLedger
            .count({
              where: {
                storeId: sourceStoreId,
                productId: { in: productIds },
                date: { gt: docDate },
              },
            })
            .then((c) => c > 0);

          const hasDestHistory = await tx.stockLedger
            .count({
              where: {
                storeId: destinationStoreId,
                productId: { in: productIds },
                date: { gt: docDate },
              },
            })
            .then((c) => c > 0);

          if (hasSourceHistory || hasDestHistory) {
            const reprocessing = await tx.inventoryReprocessing.create({
              data: {
                status: 'PENDING',
                documentTransferId: doc.id,
                date: docDate,
              },
            });
            reprocessingId = reprocessing.id;
          }
        }

        return { doc, reprocessingId };
      },
      {
        isolationLevel: 'Serializable',
      },
    );

    // POST-TRANSACTION: Reprocess History
    if (result.reprocessingId) {
      for (const productId of productIds) {
        // Reprocess both stores
        await this.inventoryService.reprocessProductHistory(
          sourceStoreId,
          productId,
          result.doc.date,
          result.reprocessingId,
        );
        await this.inventoryService.reprocessProductHistory(
          destinationStoreId,
          productId,
          result.doc.date,
          result.reprocessingId,
        );
      }
      await this.inventoryService.completeReprocessing(result.reprocessingId);
    }

    return result.doc;
  }

  async updateStatus(id: string, newStatus: 'DRAFT' | 'COMPLETED' | 'CANCELLED') {
    let reprocessingId: string | null = null;
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
          (actualNewStatus as any) = 'SCHEDULED';
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

        // DRAFT/SCHEDULED -> COMPLETED
        if (
          (oldStatus === 'DRAFT' || oldStatus === 'SCHEDULED') &&
          actualNewStatus === 'COMPLETED'
        ) {
          await this.applyInventoryMovements(tx, doc, items);

          // Check if we need reprocessing (Backdated)
          const hasSourceHistory = await tx.stockLedger
            .count({
              where: {
                storeId: doc.sourceStoreId,
                productId: { in: productIds },
                date: { gt: doc.date },
              },
            })
            .then((c) => c > 0);

          const hasDestHistory = await tx.stockLedger
            .count({
              where: {
                storeId: doc.destinationStoreId,
                productId: { in: productIds },
                date: { gt: doc.date },
              },
            })
            .then((c) => c > 0);

          if (hasSourceHistory || hasDestHistory) {
            const reprocessing = await tx.inventoryReprocessing.create({
              data: {
                status: 'PENDING',
                documentTransferId: doc.id,
                date: doc.date,
              },
            });
            reprocessingId = reprocessing.id;
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
          // Revert movements (INVERSE)
          // Transfer Out (Source) -> Revert: Increase Source Stock
          // Transfer In (Dest) -> Revert: Decrease Dest Stock

          // We can achieve this by swapping source/dest in the context passed to applyInventoryMovements?
          // No, applyInventoryMovements uses doc.sourceStoreId.

          // Let's implement revert logic explicitly or modify applyInventoryMovements to handle direction.
          // applyInventoryMovements is complex (WAP calc).

          // Revert logic:
          // 1. Dest Store: Remove items (Decrease Qty).
          // 2. Source Store: Add items back (Increase Qty). return WAP?
          //    When adding back to source, we should ideally use the COST PRICE at which it left?
          //    But we didn't store the exact cost price at moment of transfer in the item line (we only used sourceWap).
          //    However, `applyInventoryMovements` calculated `averagePurchasePrice` for Dest (inherited from Source).

          // Simpler approach for Revert:
          // Just doing the opposite of applyInventoryMovements.

          const { sourceStoreId, destinationStoreId } = doc;

          // 3. Batch Fetch Destination Stocks
          const destStocks = await tx.stock.findMany({
            where: {
              storeId: destinationStoreId,
              productId: { in: productIds },
            },
          });
          const destStockMap = new Map(destStocks.map((s) => [s.productId, s]));

          for (const item of items) {
            // REVERT DEST (Remove Qty)
            const destStock = destStockMap.get(item.productId);
            const destQty = destStock ? destStock.quantity : new Decimal(0);

            if (destQty.lessThan(item.quantity)) {
              throw new BadRequestException(
                `Недостаточно остатка товара ${item.productId} на складе получателя для отмены перемещения`,
              );
            }

            await tx.stock.update({
              where: {
                productId_storeId: {
                  productId: item.productId,
                  storeId: destinationStoreId,
                },
              },
              data: {
                quantity: { decrement: item.quantity },
              },
            });

            // Audit: Log REVERT DEST (Removal)
            await this.stockLedgerService.create(tx, {
              type: 'TRANSFER_OUT',
              storeId: destinationStoreId,
              productId: item.productId,
              quantity: item.quantity.negated(),
              date: doc.date ?? new Date(),
              documentId: doc.id ?? '',
              quantityBefore: destQty,
              quantityAfter: destQty.sub(item.quantity),
              averagePurchasePrice: destStock?.averagePurchasePrice ?? new Decimal(0),
              transactionAmount: item.quantity.mul(destStock?.averagePurchasePrice ?? 0).negated(),
              batchId: doc.id,
            });

            // REVERT SOURCE (Add Qty)
            const sourceStocks = await tx.stock.findMany({
              where: { storeId: sourceStoreId, productId: item.productId },
            });
            const sourceStock = sourceStocks[0];
            const sourceQtyBefore = sourceStock ? sourceStock.quantity : new Decimal(0);

            await tx.stock.upsert({
              where: {
                productId_storeId: {
                  productId: item.productId,
                  storeId: sourceStoreId,
                },
              },
              create: {
                productId: item.productId,
                storeId: sourceStoreId,
                quantity: item.quantity,
                averagePurchasePrice: new Decimal(0), // If it didn't exist, we don't know price.
              },
              update: {
                quantity: { increment: item.quantity },
              },
            });

            // Audit: Log REVERT SOURCE (Addition)
            await this.stockLedgerService.create(tx, {
              type: 'TRANSFER_IN',
              storeId: sourceStoreId,
              productId: item.productId,
              quantity: item.quantity,
              date: doc.date ?? new Date(),
              documentId: doc.id ?? '',
              quantityBefore: sourceQtyBefore,
              quantityAfter: sourceQtyBefore.add(item.quantity),
              averagePurchasePrice: sourceStock?.averagePurchasePrice ?? new Decimal(0),
              transactionAmount: item.quantity.mul(sourceStock?.averagePurchasePrice ?? 0),
              batchId: doc.id,
            });
          }

          // ALWAYS trigger reprocessing for REVERT
          const reprocessing = await tx.inventoryReprocessing.create({
            data: {
              status: 'PENDING',
              documentTransferId: doc.id,
              date: doc.date,
            },
          });
          reprocessingId = reprocessing.id;
          productsToReprocess = productIds;
        }

        // Update status
        const updatedDoc = await tx.documentTransfer.update({
          where: { id },
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
        isolationLevel: 'Serializable',
      },
    );

    // POST-TRANSACTION: Reprocess History
    if (reprocessingId && productsToReprocess.length > 0) {
      for (const productId of productsToReprocess) {
        await this.inventoryService.reprocessProductHistory(
          updatedDoc.sourceStoreId,
          productId,
          updatedDoc.date,
          reprocessingId,
        );
        await this.inventoryService.reprocessProductHistory(
          updatedDoc.destinationStoreId,
          productId,
          updatedDoc.date,
          reprocessingId,
        );
      }
      await this.inventoryService.completeReprocessing(reprocessingId);
    }

    return updatedDoc;
  }

  async update(id: string, updateDto: CreateDocumentTransferDto) {
    return this.prisma.$transaction(async (tx) => {
      const doc = await tx.documentTransfer.findUniqueOrThrow({
        where: { id },
        include: { items: true },
      });

      this.baseService.ensureDraft(doc.status);

      const { sourceStoreId, destinationStoreId, date, items, notes } = updateDto;
      const docDate = date ? new Date(date) : new Date();
      const safeItems = items || [];

      if (sourceStoreId === destinationStoreId) {
        throw new BadRequestException('Склад отправителя и получателя должны отличаться');
      }

      // 1. Delete existing items
      await tx.documentTransferItem.deleteMany({
        where: { transferId: id },
      });

      // 2. Prepare Items
      const preparedItems = safeItems.map((item) => ({
        productId: item.productId,
        quantity: new Decimal(item.quantity),
      }));

      // 3. Update Document
      const updatedDoc = await tx.documentTransfer.update({
        where: { id },
        data: {
          sourceStoreId,
          destinationStoreId,
          date: docDate,
          notes,
          items: {
            create: preparedItems.map((i) => ({
              productId: i.productId,
              quantity: i.quantity,
            })),
          },
        },
        include: { items: true },
      });

      const changes: Record<string, any> = {};
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

      await this.ledgerService.logDiff(
        tx,
        {
          documentId: id,
          documentType: 'documentTransfer',
        },
        doc.items,
        preparedItems.map((item) => ({
          productId: item.productId,
          quantity: item.quantity, // quantity is Decimal? No, in preparedItems it is Decimal
        })),
        ['quantity'],
      );

      return updatedDoc;
    });
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
          `Недостаточно остатка товара ${item.productId} на складе отправителя`,
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
      const destWap = destStock ? destStock.averagePurchasePrice : new Decimal(0);

      const sourceWap = sourceStock ? sourceStock.averagePurchasePrice : new Decimal(0);

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
      await this.stockLedgerService.create(tx, {
        type: 'TRANSFER_OUT',
        storeId: sourceStoreId,
        productId: item.productId,
        quantity: item.quantity.negated(),
        date: doc.date ?? new Date(),
        documentId: doc.id ?? '',

        quantityBefore: updatedSourceStock.quantity.add(item.quantity),
        quantityAfter: updatedSourceStock.quantity,

        averagePurchasePrice: updatedSourceStock.averagePurchasePrice,
        transactionAmount: item.quantity.mul(updatedSourceStock.averagePurchasePrice).negated(),

        batchId: doc.id,
      });

      // Audit: Log TRANSFER_IN
      await this.stockLedgerService.create(tx, {
        type: 'TRANSFER_IN',
        storeId: destinationStoreId,
        productId: item.productId,
        quantity: item.quantity,
        date: doc.date ?? new Date(),
        documentId: doc.id ?? '',

        quantityBefore: destQty,
        quantityAfter: newDestQty,

        averagePurchasePrice: newDestWap,
        transactionAmount: item.quantity.mul(sourceWap), // Value coming IN is derived from Source WAP

        batchId: doc.id,
      });
    }
  }

  findAll(include?: Record<string, boolean>) {
    return this.prisma.documentTransfer.findMany({
      include,
      orderBy: { createdAt: 'desc' },
    });
  }

  findOne(id: string) {
    return this.prisma.documentTransfer.findUniqueOrThrow({
      where: { id },
      include: {
        items: true,
        sourceStore: true,
        destinationStore: true,
        documentLedger: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }
}
