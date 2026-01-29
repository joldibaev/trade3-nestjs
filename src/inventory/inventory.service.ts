import { BadRequestException, Injectable } from '@nestjs/common';

import { Prisma } from '../generated/prisma/client';
import { LedgerReason, StockMovementType } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import Decimal = Prisma.Decimal;

export type MovementDirection = 'IN' | 'OUT';

export interface MovementContext {
  storeId: string;
  type: StockMovementType;
  date: Date;
  documentId: string;
  reason?: LedgerReason;
  causationId?: string;
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
      return currentWap;
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
  async lockProduct(
    tx: Prisma.TransactionClient,
    storeId: string,
    productId: string,
  ): Promise<void> {
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
    causationId: string,
  ): Promise<void> {
    return this.prisma.$transaction(async (tx) => {
      // 0. ACQUIRE LOCK (Critical for Concurrency Safety)
      await this.lockProduct(tx, storeId, productId);

      let iterations = 0;
      const maxIterations = 5;
      let repairsMade = true;

      while (repairsMade && iterations < maxIterations) {
        repairsMade = false;
        iterations++;

        // 1. Get snapshot BEFORE fromDate (to establish initial state)
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

        // 2. Fetch all movements AFTER (or equal) fromDate
        const movements = await tx.stockLedger.findMany({
          where: {
            storeId,
            productId,
            date: { gte: fromDate },
          },
          include: {
            documentPurchase: { include: { items: true } },
            documentSale: { include: { items: true } },
            documentReturn: { include: { items: true } },
            documentAdjustment: { include: { items: true } },
            documentTransfer: { include: { items: true } },
          },
        });

        // --- TOPOLOGICAL RE-ORDERING ---
        // Group stornos with their root ancestors and sort based on root creation time.
        const moveMap = new Map<string, (typeof movements)[0]>();
        const parentMap = new Map<string, string>();
        movements.forEach((m) => {
          moveMap.set(m.id, m);
          if (m.parentLedgerId) parentMap.set(m.id, m.parentLedgerId);
        });

        const getRoot = (id: string): (typeof movements)[0] => {
          let currentId = id;
          while (parentMap.has(currentId)) {
            currentId = parentMap.get(currentId)!;
          }
          return moveMap.get(currentId) || moveMap.get(id)!;
        };

        movements.sort((a, b) => {
          const dateA = a.date.getTime();
          const dateB = b.date.getTime();
          if (dateA !== dateB) return dateA - dateB;

          const rootA = getRoot(a.id);
          const rootB = getRoot(b.id);

          if (rootA.id !== rootB.id) {
            const rootCreatedAtDiff = rootA.createdAt.getTime() - rootB.createdAt.getTime();
            if (rootCreatedAtDiff !== 0) return rootCreatedAtDiff;
            return rootA.id.localeCompare(rootB.id); // Ultimate tie-break
          }

          return a.createdAt.getTime() - b.createdAt.getTime();
        });

        // Pre-scan for existing reversals to avoid double-storno
        const existingReversalIds = new Set(
          movements.filter((m) => m.parentLedgerId).map((m) => m.parentLedgerId),
        );

        for (const move of movements) {
          const isPurchaseCompleted = move.documentPurchase?.status === 'COMPLETED';
          const isSaleCompleted = move.documentSale?.status === 'COMPLETED';
          const isReturnCompleted = move.documentReturn?.status === 'COMPLETED';
          const isAdjustmentCompleted = move.documentAdjustment?.status === 'COMPLETED';
          const isTransferCompleted = move.documentTransfer?.status === 'COMPLETED';

          const docIsStillValid =
            (move.documentPurchase && isPurchaseCompleted) ||
            (move.documentSale && isSaleCompleted) ||
            (move.documentReturn && isReturnCompleted) ||
            (move.documentAdjustment && isAdjustmentCompleted) ||
            (move.documentTransfer && isTransferCompleted);

          // PURE LEDGER RULE:
          // We process every entry in the ledger to maintain mathematical consistency.
          // Document status only determines if we need to "Heal" the ledger by adding
          // missing reversals or corrections.

          const qtyChange = move.quantity;
          const nextQty = currentQty.add(qtyChange).toDP(3);
          let newWap = currentWap;

          // 1. Recovery: If a document is no longer valid but has an active INITIAL entry,
          // neutralize it now by appending a REVERSAL to the ledger.
          if (!docIsStillValid && move.reason === 'INITIAL' && !existingReversalIds.has(move.id)) {
            await tx.stockLedger.create({
              data: {
                type: move.type,
                storeId: move.storeId,
                productId: move.productId,
                quantity: move.quantity.negated(),
                quantityBefore: nextQty,
                quantityAfter: currentQty,
                averagePurchasePrice: currentWap,
                transactionAmount: move.transactionAmount.negated(),
                batchId: move.batchId,
                date: move.date,
                reason: 'REVERSAL',
                parentLedgerId: move.id,
                causationId: causationId,
                documentPurchaseId: move.documentPurchaseId,
                documentSaleId: move.documentSaleId,
                documentReturnId: move.documentReturnId,
                documentAdjustmentId: move.documentAdjustmentId,
                documentTransferId: move.documentTransferId,
              },
            });
            repairsMade = true;
            break;
          }

          // 2. WAP Calculation:
          // Always derive cost from the ledger entry's own transactionAmount.
          const isWapAffecting = ['PURCHASE', 'TRANSFER_IN', 'ADJUSTMENT', 'RETURN'].includes(
            move.type,
          );
          if (isWapAffecting) {
            const absQty = move.quantity.abs();
            let incomingPrice = !absQty.isZero()
              ? move.transactionAmount.abs().div(absQty).toDP(2)
              : currentWap;

            if (move.reason === 'INITIAL') {
              if (move.type === 'PURCHASE' && move.documentPurchase) {
                const item = move.documentPurchase.items.find((i) => i.productId === productId);
                if (item) incomingPrice = item.price.toDP(2);
              } else if (move.type === 'RETURN' && move.documentReturn) {
                const item = move.documentReturn.items.find((i) => i.productId === productId);
                if (item) incomingPrice = item.price.toDP(2);
              }
            }

            newWap = this.calculateNewWap(currentQty, currentWap, qtyChange, incomingPrice).toDP(2);
          }

          // 3. Business Logic: Update document cost prices
          if (move.type === 'SALE' && move.documentSale && docIsStillValid) {
            const item = move.documentSale.items.find((i) => i.productId === productId);
            if (item) {
              await tx.documentSaleItem.update({
                where: { id: item.id },
                data: { costPrice: currentWap },
              });
            }
          }

          // 4. Snapshot Integrity: Compare calculated state with recorded state.
          // Normalize to DB precision before comparison to prevent precision-noise loops.
          const isREVERSAL = move.reason === 'REVERSAL';
          const alreadyReversed = existingReversalIds.has(move.id);
          const snapshotsChanged =
            !move.quantityAfter.toDP(3).equals(nextQty) ||
            !move.averagePurchasePrice.toDP(2).equals(newWap);

          if (snapshotsChanged && docIsStillValid && !alreadyReversed && !isREVERSAL) {
            // Handle snapshot correction via REVERSAL + CORRECTION
            await tx.stockLedger.create({
              data: {
                type: move.type,
                storeId: move.storeId,
                productId: move.productId,
                quantity: move.quantity.negated(),
                quantityBefore: move.quantityAfter,
                quantityAfter: move.quantityBefore,
                averagePurchasePrice: move.averagePurchasePrice,
                transactionAmount: move.transactionAmount.negated(),
                batchId: move.batchId,
                date: move.date,
                reason: 'REVERSAL',
                parentLedgerId: move.id,
                causationId: causationId,
                documentPurchaseId: move.documentPurchaseId,
                documentSaleId: move.documentSaleId,
                documentReturnId: move.documentReturnId,
                documentAdjustmentId: move.documentAdjustmentId,
                documentTransferId: move.documentTransferId,
              },
            });

            // For the CORRECTION, we use the "latest" known price for this movement type
            let correctionPrice = currentWap;
            if (move.type === 'PURCHASE' && move.documentPurchase) {
              const item = move.documentPurchase.items.find((i) => i.productId === productId);
              if (item) correctionPrice = item.price;
            }

            await tx.stockLedger.create({
              data: {
                type: move.type,
                storeId: move.storeId,
                productId: move.productId,
                quantity: move.quantity,
                quantityBefore: currentQty,
                quantityAfter: nextQty,
                averagePurchasePrice: newWap,
                transactionAmount: move.quantity.abs().mul(correctionPrice),
                batchId: move.batchId,
                date: move.date,
                reason: 'CORRECTION',
                parentLedgerId: move.id,
                causationId: causationId,
                documentPurchaseId: move.documentPurchaseId,
                documentSaleId: move.documentSaleId,
                documentReturnId: move.documentReturnId,
                documentAdjustmentId: move.documentAdjustmentId,
                documentTransferId: move.documentTransferId,
              },
            });
            repairsMade = true;
            break;
          }

          currentQty = nextQty;
          currentWap = newWap;
        }

        if (!repairsMade) {
          // 4. Update the actual Stock table
          await tx.stock.upsert({
            where: { productId_storeId: { productId, storeId } },
            create: { productId, storeId, quantity: currentQty, averagePurchasePrice: currentWap },
            update: { quantity: currentQty, averagePurchasePrice: currentWap },
          });
        }
      }
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
  ): Promise<void> {
    const { storeId, type, date, documentId, reason = 'INITIAL', causationId } = context;

    // Protection against double-initialization
    // We only skip if the document item ALREADY has the intended net effect in the ledger.
    // This allows re-completing a document that was previously reverted.
    if (reason === 'INITIAL') {
      const existingMoves = await tx.stockLedger.findMany({
        where: {
          OR: [
            { documentPurchaseId: documentId },
            { documentSaleId: documentId },
            { documentReturnId: documentId },
            { documentAdjustmentId: documentId },
            { documentTransferId: documentId },
          ],
          productId: { in: items.map((i) => i.productId) },
          storeId,
          type,
        },
        select: { productId: true, quantity: true },
      });

      const netQuantities = new Map<string, Decimal>();
      for (const m of existingMoves) {
        const val = netQuantities.get(m.productId) || new Decimal(0);
        netQuantities.set(m.productId, val.add(m.quantity));
      }

      items = items.filter((item) => {
        const net = netQuantities.get(item.productId) || new Decimal(0);
        const target = direction === 'IN' ? item.quantity : item.quantity.negated();
        return !net.equals(target);
      });

      if (items.length === 0) return;
    }

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
      if (newQty.lessThan(0)) {
        throw new BadRequestException(
          `Недостаточно остатка товара ${item.productId} на складе ${storeId} (остаток: ${oldQty.toString()}, требуется списать: ${qtyDelta.abs().toString()})`,
        );
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
        reason,
        causationId: causationId || documentId,
      };

      // In Strict Storno, try to link REVERSALs to their parent INITIAL entry
      if (reason === 'REVERSAL') {
        const parent = await tx.stockLedger.findFirst({
          where: {
            OR: [
              { documentPurchaseId: documentId },
              { documentSaleId: documentId },
              { documentReturnId: documentId },
              { documentAdjustmentId: documentId },
              { documentTransferId: documentId },
            ],
            reason: 'INITIAL',
            productId: item.productId,
            storeId,
          },
          orderBy: { createdAt: 'desc' },
        });
        if (parent) {
          ledgerData.parentLedgerId = parent.id;
        }
      }

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
  ): Promise<void> {
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
