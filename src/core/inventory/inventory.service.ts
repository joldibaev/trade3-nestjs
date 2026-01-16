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
   * REPROCESS HISTORY
   * Re-calculates WAP and Stock Balance sequentially from a given date.
   * Used when past Purchase/Adjustment documents are cancelled or modified.
   */
  async reprocessProductHistory(storeId: string, productId: string, fromDate: Date): Promise<void> {
    // 1. Get snapshot BEFORE fromDate (to establish initial state)
    // We look for the Last movement before fromDate
    const lastMovement = await this.prisma.stockMovement.findFirst({
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
    const movements = await this.prisma.stockMovement.findMany({
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
          // Adjustments might have specific logic, but usually they just fix quantity.
          // If it's a "Found" item (Positive), we might not have a price unless we store it.
          // For now, let's assume Adjustment keeps current WAP or uses Fallback.
          // But strict WAP formula needs a price.
          // If logic says "Adjustment uses current WAP", then incomingPrice = currentWap.
          // If it creates value from zero, we have a problem.
          // Simplification: Adjustment uses currentWap.
          incomingPrice = currentWap;
        } else if (move.type === 'RETURN') {
          // Return typically shouldn't change WAP (it's a reversal).
          // But if we treat it as incoming stock, we need to price it.
          // Standard logic: Return uses the Cost Price it was Sold at? Or Current WAP?
          // Docs say: "Return... Upsert Stock... Fallback WAP".
          // So it effectively adopts the current market WAP or Fallback.
          // We will keep current WAP unchanged.
          incomingPrice = currentWap;
        } else if (move.type === 'TRANSFER_IN') {
          // Transfer IN implies it came with a price from Source.
          // This is complex because we need the source movement.
          // For MVP Reprocessing, let's assume Transfer IN brings value = currentWap
          // (Weakness: IF source WAP changed, we miss it here without recursive reprocessing).
          incomingPrice = currentWap;
        }

        // Calculate NEW WAP
        // Formula: (Qty * WAP + IncQty * IncPrice) / (Qty + IncQty)
        // Only Purchase actually brings a NEW price usually.
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
            await this.prisma.documentSaleItem.update({
              where: { id: item.id },
              data: { costPrice: currentWap },
            });
          }
        }

        currentQty = currentQty.add(qtyChange); // qtyChange is negative
      }

      // 3. Update the Audit Log Snapshot
      await this.prisma.stockMovement.update({
        where: { id: move.id },
        data: {
          quantityAfter: currentQty,
          averagePurchasePrice: currentWap,
        },
      });
    }

    // 4. Finally, update the actual Stock table to match the end state
    await this.prisma.stock.update({
      where: { productId_storeId: { productId, storeId } },
      data: {
        quantity: currentQty,
        averagePurchasePrice: currentWap,
      },
    });
  }
}
