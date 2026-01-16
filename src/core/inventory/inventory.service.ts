import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import Decimal = Prisma.Decimal;

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
  async reprocessProductHistory(storeId: string, productId: string, fromDate: Date): Promise<void> {
    return this.prisma.$transaction(
      async (tx) => {
        // 0. ACQUIRE LOCK (Critical for Concurrency Safety)
        await this.lockProduct(tx, storeId, productId);

        // 1. Get snapshot BEFORE fromDate (to establish initial state)
        // We look for the Last movement before fromDate
        const lastMovement = await tx.stockMovement.findFirst({
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
        const movements = await tx.stockMovement.findMany({
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

        for (const move of movements) {
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
          await tx.stockMovement.update({
            where: { id: move.id },
            data: {
              quantityAfter: currentQty,
              averagePurchasePrice: currentWap,
            },
          });
        }

        // 4. Finally, update the actual Stock table to match the end state
        await tx.stock.update({
          where: { productId_storeId: { productId, storeId } },
          data: {
            quantity: currentQty,
            averagePurchasePrice: currentWap,
          },
        });
      },
      {
        isolationLevel: 'ReadCommitted', // Advisory locks handle strict concurrency
        timeout: 20000, // Allow more time for reprocessing
      },
    );
  }
}
