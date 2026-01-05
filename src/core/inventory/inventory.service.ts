import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import Decimal = Prisma.Decimal;
import { StockMovementType } from '../../generated/prisma/enums';

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Validates if a store exists. Throws NotFoundException if not.
   */
  async validateStore(storeId: string): Promise<void> {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
    });
    if (!store) throw new NotFoundException('Store not found');
  }

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
   * Finds a fallback WAP for a product by checking stocks in other stores.
   * Useful for Returns/Adjustments when local stock is empty/zero-cost.
   */
  async getFallbackWap(
    productId: string,
    tx: Prisma.TransactionClient,
  ): Promise<Decimal> {
    const product = await tx.product.findUnique({
      where: { id: productId },
      include: {
        stocks: {
          where: { averagePurchasePrice: { gt: 0 } },
          take: 1,
        },
      },
    });

    if (product && product.stocks.length > 0) {
      return product.stocks[0].averagePurchasePrice;
    }
    return new Decimal(0);
  }

  /**
   * Logs a standardized StockMovement record ensuring strong relations and snapshots.
   */
  async logStockMovement(
    tx: Prisma.TransactionClient,
    data: {
      type:
        | 'PURCHASE'
        | 'SALE'
        | 'RETURN'
        | 'ADJUSTMENT'
        | 'TRANSFER_IN'
        | 'TRANSFER_OUT';
      storeId: string;
      productId: string;
      quantity: Decimal;
      date: Date | string;
      documentId: string; // The ID of the specific document
      quantityAfter: Decimal;
      averagePurchasePrice: Decimal;
    },
  ) {
    const {
      type,
      storeId,
      productId,
      quantity,
      date,
      documentId,
      quantityAfter,
      averagePurchasePrice,
    } = data;

    const dataInput: Prisma.StockMovementUncheckedCreateInput = {
      type: type as StockMovementType,
      storeId,
      productId,
      quantity,
      date: new Date(date),
      quantityAfter,
      averagePurchasePrice,
    };

    // Map the generic documentId to the specific relation field
    if (type === 'PURCHASE') dataInput.documentPurchaseId = documentId;
    if (type === 'SALE') dataInput.documentSaleId = documentId;
    if (type === 'RETURN') dataInput.documentReturnId = documentId;
    if (type === 'ADJUSTMENT') dataInput.documentAdjustmentId = documentId;
    if (type === 'TRANSFER_IN' || type === 'TRANSFER_OUT')
      dataInput.documentTransferId = documentId;

    await tx.stockMovement.create({
      data: dataInput,
    });
  }
}
