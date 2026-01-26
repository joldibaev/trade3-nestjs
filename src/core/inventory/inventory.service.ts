import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { StockMovementType } from '../../generated/prisma/enums';
import Decimal = Prisma.Decimal;

export type MovementDirection = 'IN' | 'OUT';

export interface MovementContext {
  storeId: string;
  type: StockMovementType;
  date: Date;
  documentId: string;
}

export interface MovementItem {
  productId: string;
  quantity: Decimal;
  price: Decimal;
}

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calculates the new Weighted Average Price (WAP).
   * Formula: (OldQty * OldWap + NewQty * NewPrice) / (OldQty + NewQty)
   */
  calculateNewWap(
    currentQty: Decimal,
    currentWap: Decimal,
    incomingQty: Decimal,
    incomingPrice: Decimal,
  ): Decimal {
    const totalQty = currentQty.add(incomingQty);

    if (totalQty.isZero()) {
      return new Decimal(0);
    }

    const currentVal = currentQty.mul(currentWap);
    const incomingVal = incomingQty.mul(incomingPrice);

    return currentVal.add(incomingVal).div(totalQty);
  }

  /**
   * Batch fetches fallback WAPs for multiple products.
   * Returns a Map<productId, wap>.
   */
  async getFallbackWapMap(productIds: string[]): Promise<Map<string, Decimal>> {
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      include: {
        stocks: {
          where: { averagePurchasePrice: { gt: 0 } },
          take: 1,
        },
      },
    });

    const map = new Map<string, Decimal>();
    for (const p of products) {
      if (p.stocks.length > 0) {
        map.set(p.id, p.stocks[0].averagePurchasePrice);
      }
    }
    return map;
  }

  /**
   * Acquires a transaction-level advisory lock for a specific product in a store.
   * Key mapping: hash(storeId + '-' + productId)
   * This prevents concurrent modifications (e.g. Sales) while Reprocessing is running,
   * provided that Sales also acquire this lock.
   */
  async lockProduct(tx: Prisma.TransactionClient, storeId: string, productId: string) {
    // Generate a unique numeric key for the lock
    const keyString = `${storeId}-${productId}`;
    // Use Postgres hashtext function to generate a bigint key from string
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${keyString}))`;
  }

  /**
   * REPROCESS HISTORY
   * Re-calculates WAP and Stock Balance sequentially from a given date.
   * Used when past Purchase/Adjustment documents are cancelled or modified.
   */
  async reprocessProductHistory(
    storeId: string,
    productId: string,
    fromDate: Date,
    reprocessingId?: string,
  ): Promise<void> {
    return this.prisma.$transaction(
      async (tx) => {
        // 0. ACQUIRE LOCK (Critical for Concurrency Safety)
        await this.lockProduct(tx, storeId, productId);

        // Capture state BEFORE recalculation (but AFTER initial conduct)
        const stockBefore = await tx.stock.findUnique({
          where: { productId_storeId: { productId, storeId } },
        });
        const oldQty = stockBefore?.quantity || new Decimal(0);
        const oldWap = stockBefore?.averagePurchasePrice || new Decimal(0);

        // 1. Get snapshot BEFORE fromDate (to establish initial state)
        // We look for the Last movement before fromDate
        const lastMovement = await tx.stockLedger.findFirst({
          where: {
            storeId,
            productId,
            date: { lt: fromDate },
          },
          orderBy: { date: 'desc' },
        });

        let currentQty = lastMovement ? lastMovement.quantityAfter : new Decimal(0);
        let currentWap = lastMovement ? lastMovement.averagePurchasePrice : new Decimal(0);

        // 2. Fetch all movements AFTER (or equal) fromDate, ordered by Date
        // Note: We need to include related documents to know prices
        const movements = await tx.stockLedger.findMany({
          where: {
            storeId,
            productId,
            date: { gte: fromDate },
          },
          orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
          include: {
            documentPurchase: { include: { items: true } },
            documentSale: { include: { items: true } },
            documentReturn: { include: { items: true } },
            documentAdjustment: { include: { items: true } },
            documentTransfer: { include: { items: true } },
          },
        });

        let affectedCount = 0;
        for (const move of movements) {
          // 2.1. Guard check: Only process movements from COMPLETED (conducted) documents
          // This ensures that DRAFT, SCHEDULED, or CANCELLED documents don't affect.documentHistory.
          // Note: When a document is CANCELLED, its original movements are still in the ledger,
          // but they should no longer affect the recalculation.
          const isPurchaseCompleted = move.documentPurchase?.status === 'COMPLETED';
          const isSaleCompleted = move.documentSale?.status === 'COMPLETED';
          const isReturnCompleted = move.documentReturn?.status === 'COMPLETED';
          const isAdjustmentCompleted = move.documentAdjustment?.status === 'COMPLETED';
          const isTransferCompleted = move.documentTransfer?.status === 'COMPLETED';

          if (
            (move.documentPurchase && !isPurchaseCompleted) ||
            (move.documentSale && !isSaleCompleted) ||
            (move.documentReturn && !isReturnCompleted) ||
            (move.documentAdjustment && !isAdjustmentCompleted) ||
            (move.documentTransfer && !isTransferCompleted)
          ) {
            // Update the audit log to reflect that these movements are now orphaned/inactive in history
            // We set them to match the CURRENT state (no change)
            await tx.stockLedger.update({
              where: { id: move.id },
              data: {
                quantityAfter: currentQty,
                averagePurchasePrice: currentWap,
              },
            });
            continue;
          }

          // Logic mirrors the "Create" logic of each service
          const qtyChange = move.quantity; // + or -

          // --- CASE 1: INCOMING (Purchase, Return, Adjustment+, TransferIn) ---
          if (qtyChange.isPositive()) {
            let incomingPrice = currentWap; // Default for things like Return (if no policy)

            if (move.type === 'PURCHASE' && move.documentPurchase) {
              // Find item for this product
              const item = move.documentPurchase.items.find((i) => i.productId === productId);
              if (item) incomingPrice = item.price;
            } else if (move.type === 'ADJUSTMENT' && move.documentAdjustment) {
              incomingPrice = currentWap;
            } else if (move.type === 'RETURN') {
              incomingPrice = currentWap;
            } else if (move.type === 'TRANSFER_IN') {
              incomingPrice = currentWap;
            }

            // Calculate NEW WAP
            if (move.type === 'PURCHASE' && !currentQty.add(qtyChange).isZero()) {
              const oldVal = currentQty.mul(currentWap);
              const incomingVal = qtyChange.mul(incomingPrice);
              currentWap = oldVal.add(incomingVal).div(currentQty.add(qtyChange));
            }

            currentQty = currentQty.add(qtyChange);
          } else {
            /*
             * CASE 2: OUTGOING (Sale, TransferOut, Adjustment-, Return?)
             */
            // SPECIAL CASE: Negative PURCHASE (Revert/Cancellation)
            // If we are reverting a purchase, we must REMOVE its weighted value contribution.
            if (move.type === 'PURCHASE' && move.documentPurchase) {
              const item = move.documentPurchase.items.find((i) => i.productId === productId);
              if (item) {
                const purchasePrice = item.price;
                const removedQty = qtyChange.abs();

                // Formula: (CurrentVal - RemovedVal) / (CurrentQty - RemovedQty)
                const currentVal = currentQty.mul(currentWap);
                const removedVal = removedQty.mul(purchasePrice);

                // Avoid division by zero
                const newQty = currentQty.sub(removedQty);
                if (newQty.isZero()) {
                  currentWap = new Decimal(0); // Reset if stock becomes 0
                } else {
                  currentWap = currentVal.sub(removedVal).div(newQty);
                }
              }
            }

            // Sale/Out does NOT change WAP. It just consumes stock.
            // BUT: We must update the "Cost Price" on the Sale Item to reflect the new history!
            else if (move.type === 'SALE' && move.documentSale) {
              // Find item
              const item = move.documentSale.items.find((i) => i.productId === productId);
              if (item) {
                // UPDATE THE SALE ITEM COST PRICE
                // This is the core "Business Value" of Reprocessing
                await tx.documentSaleItem.update({
                  where: { id: item.id },
                  data: { costPrice: currentWap },
                });
              }
            }

            currentQty = currentQty.add(qtyChange); // qtyChange is negative
          }

          // 3. Update the Audit Log Snapshot
          await tx.stockLedger.update({
            where: { id: move.id },
            data: {
              quantityAfter: currentQty,
              averagePurchasePrice: currentWap,
            },
          });
          affectedCount++;
        }

        // 4. Finally, update the actual Stock table to match the end state
        await tx.stock.update({
          where: { productId_storeId: { productId, storeId } },
          data: {
            quantity: currentQty,
            averagePurchasePrice: currentWap,
          },
        });

        // 5. Audit Logging
        if (reprocessingId) {
          await tx.inventoryReprocessingItem.create({
            data: {
              reprocessingId,
              productId,
              storeId,
              oldQuantity: oldQty,
              newQuantity: currentQty,
              oldAveragePurchasePrice: oldWap,
              newAveragePurchasePrice: currentWap,
              affectedLedgerCount: affectedCount,
            },
          });
        }
      },
      {
        isolationLevel: 'ReadCommitted', // Advisory locks handle strict concurrency
        timeout: 20000, // Allow more time for reprocessing
      },
    );
  }

  /**
   * Checks if a document is backdated and triggers reprocessing if needed.
   * Returns the ID of the created InventoryReprocessing document, or null.
   */
  async triggerReprocessingIfNeeded(
    tx: Prisma.TransactionClient,
    params: {
      storeId: string;
      productId: string | string[];
      date: Date;
      documentId: string;
      documentType:
        | 'documentPurchase'
        | 'documentSale'
        | 'documentReturn'
        | 'documentAdjustment'
        | 'documentTransfer';
    },
  ): Promise<string | null> {
    const productIds = Array.isArray(params.productId) ? params.productId : [params.productId];

    // Check if there are ANY movements after this date for these products in this store
    const laterMovementsCount = await tx.stockLedger.count({
      where: {
        storeId: params.storeId,
        productId: { in: productIds },
        date: { gt: params.date },
      },
    });

    if (laterMovementsCount === 0) {
      return null;
    }

    const reprocessing = await tx.inventoryReprocessing.create({
      data: {
        status: 'PENDING',
        date: params.date,
        [`${params.documentType}Id`]: params.documentId,
      } as unknown as Prisma.InventoryReprocessingCreateInput,
    });

    return reprocessing.id;
  }

  /**
   * Completes a reprocessing document if all its items are done.
   */
  async completeReprocessing(id: string) {
    await this.prisma.inventoryReprocessing.update({
      where: { id },
      data: { status: 'COMPLETED' },
    });
  }

  /**
   * Core logic to apply inventory movements (stocks + ledger).
   * Direction 'IN' increases stock and updates WAP.
   * Direction 'OUT' decreases stock and checks availability.
   */
  async applyMovements(
    tx: Prisma.TransactionClient,
    context: MovementContext,
    items: MovementItem[],
    direction: MovementDirection,
  ) {
    const { storeId, type, date, documentId } = context;

    for (const item of items) {
      const stock = await tx.stock.findUnique({
        where: { productId_storeId: { productId: item.productId, storeId } },
      });

      const oldQty = stock?.quantity || new Decimal(0);
      const oldWap = stock?.averagePurchasePrice || new Decimal(0);

      // Adjusted quantity based on direction
      const qtyDelta = direction === 'IN' ? item.quantity : item.quantity.negated();

      // For 'OUT', check if we have enough stock (already checked in services but keeping here for safety)
      const newQty = oldQty.add(qtyDelta);
      if (direction === 'OUT' && newQty.lessThan(0)) {
        throw new Error(`Insufficient stock for product ${item.productId} in store ${storeId}`);
      }

      // Calculate NEW WAP for incoming movements
      let newWap = oldWap;
      if (direction === 'IN' && item.quantity.isPositive()) {
        newWap = this.calculateNewWap(oldQty, oldWap, item.quantity, item.price);
      }

      // Update Stock Table
      await tx.stock.upsert({
        where: { productId_storeId: { productId: item.productId, storeId } },
        create: {
          productId: item.productId,
          storeId,
          quantity: newQty,
          averagePurchasePrice: newWap,
        },
        update: {
          quantity: newQty,
          averagePurchasePrice: newWap,
        },
      });

      // Create Stock Ledger Entry
      const ledgerData: Prisma.StockLedgerUncheckedCreateInput = {
        type,
        storeId,
        productId: item.productId,
        quantity: qtyDelta,
        date,
        quantityBefore: oldQty,
        quantityAfter: newQty,
        averagePurchasePrice: newWap,
        transactionAmount: qtyDelta.mul(direction === 'IN' ? item.price : oldWap),
        batchId: documentId,
      };

      // Set document ID based on type
      switch (type) {
        case 'PURCHASE':
          ledgerData.documentPurchaseId = documentId;
          break;
        case 'SALE':
          ledgerData.documentSaleId = documentId;
          break;
        case 'ADJUSTMENT':
          ledgerData.documentAdjustmentId = documentId;
          break;
        case 'RETURN':
          ledgerData.documentReturnId = documentId;
          break;
        case 'TRANSFER_IN':
        case 'TRANSFER_OUT':
          ledgerData.documentTransferId = documentId;
          break;
      }

      await tx.stockLedger.create({ data: ledgerData });
    }
  }

  /**
   * Validates if a document can be reverted without causing negative stock or negative WAP.
   */
  async validateRevertVisibility(
    tx: Prisma.TransactionClient,
    storeId: string,
    items: MovementItem[],
  ) {
    const productIds = items.map((i) => i.productId);
    const stocks = await tx.stock.findMany({
      where: { storeId, productId: { in: productIds } },
    });
    const stockMap = new Map(stocks.map((s) => [s.productId, s]));

    for (const item of items) {
      const stock = stockMap.get(item.productId);
      const currentQty = stock?.quantity || new Decimal(0);
      const currentWap = stock?.averagePurchasePrice || new Decimal(0);

      // 1. Quantity Check
      if (currentQty.lessThan(item.quantity)) {
        throw new BadRequestException(
          `Недостаточно остатка товара ${item.productId} для отмены операции (доступно: ${currentQty.toString()}, требуется: ${item.quantity.toString()})`,
        );
      }

      // 2. Financial Check (prevent negative WAP)
      const currentTotalValue = currentQty.mul(currentWap);
      const revertTotalValue = item.quantity.mul(item.price);

      if (currentTotalValue.lessThan(revertTotalValue)) {
        throw new BadRequestException(
          `Нельзя отменить операцию для товара ${item.productId}: остаточная стоимость станет отрицательной.`,
        );
      }
    }
  }
}
