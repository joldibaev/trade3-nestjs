import { Injectable } from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';

export type LedgerActionType =
  | 'CREATED'
  | 'UPDATED'
  | 'STATUS_CHANGED'
  | 'ITEM_ADDED'
  | 'ITEM_REMOVED'
  | 'ITEM_CHANGED'
  | 'DELETED';

interface LogActionParams {
  documentId: string;
  documentType:
    | 'documentPurchase'
    | 'documentSale'
    | 'documentReturn'
    | 'documentAdjustment'
    | 'documentTransfer'
    | 'documentPriceChange';
  action: LedgerActionType;
  details?: Record<string, any>;
  userId?: string;
}

@Injectable()
export class DocumentLedgerService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Log a generic action for a document.
   */
  async logAction(tx: Prisma.TransactionClient, params: LogActionParams) {
    const { documentId, documentType, action, details } = params;

    const data: Prisma.DocumentLedgerUncheckedCreateInput = {
      action,
      details: details || Prisma.JsonNull,
      // userId, // REMOVED as User model is gone, logic also removed from earlier iterations but good to confirm
      documentPurchaseId: documentType === 'documentPurchase' ? documentId : null,
      documentSaleId: documentType === 'documentSale' ? documentId : null,
      documentReturnId: documentType === 'documentReturn' ? documentId : null,
      documentAdjustmentId: documentType === 'documentAdjustment' ? documentId : null,
      documentTransferId: documentType === 'documentTransfer' ? documentId : null,
      documentPriceChangeId: documentType === 'documentPriceChange' ? documentId : null,
    };

    /* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
    await (tx as any).documentLedger.create({
      data,
    });
    /* eslint-enable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
  }

  /**
   * Helper to diff two arrays of items and log changes.
   * Compares items by their "id" or "productId".
   *
   * @param oldItems Existing items
   * @param newItems New items state
   * @param compareFields Fields to compare for 'ITEM_CHANGED'
   */
  async logDiff<T extends { productId: string } & Record<string, unknown>>(
    tx: Prisma.TransactionClient,
    baseParams: Omit<LogActionParams, 'action' | 'details'>,
    oldItems: T[],
    newItems: T[],
    compareFields: (keyof T)[],
  ) {
    const { documentId, documentType, userId } = baseParams;

    const oldMap = new Map(oldItems.map((i) => [i.productId, i]));
    const newMap = new Map(newItems.map((i) => [i.productId, i]));

    // 1. Check for Added Items
    for (const newItem of newItems) {
      if (!oldMap.has(newItem.productId)) {
        await this.logAction(tx, {
          documentId,
          documentType,
          action: 'ITEM_ADDED',
          userId,
          details: newItem,
        });
      }
    }

    // 2. Check for Removed Items
    for (const oldItem of oldItems) {
      if (!newMap.has(oldItem.productId)) {
        await this.logAction(tx, {
          documentId,
          documentType,
          action: 'ITEM_REMOVED',
          userId,
          details: oldItem,
        });
      }
    }

    // 3. Check for Changed Items
    for (const newItem of newItems) {
      const oldItem = oldMap.get(newItem.productId);
      if (oldItem) {
        const changes: Record<string, { from: unknown; to: unknown }> = {};
        let hasChanges = false;

        for (const field of compareFields) {
          const oldVal = oldItem[field];
          const newVal = newItem[field];

          if (!this.areValuesEqual(oldVal, newVal)) {
            changes[field as string] = {
              from: oldVal,
              to: newVal,
            };
            hasChanges = true;
          }
        }

        if (hasChanges) {
          await this.logAction(tx, {
            documentId,
            documentType,
            action: 'ITEM_CHANGED',
            userId,
            details: {
              productId: newItem.productId,
              changes,
            },
          });
        }
      }
    }
  }

  private areValuesEqual(val1: unknown, val2: unknown): boolean {
    if (val1 === val2) return true;

    // Handle Prisma Decimal (or similar objects with equals method)
    if (this.isDecimal(val1) && this.isDecimal(val2)) {
      return val1.equals(val2);
    }

    // Handle generic object stringification only if it has a custom toString
    if (this.hasToString(val1) && this.hasToString(val2)) {
      return val1.toString() === val2.toString();
    }

    return false;
  }

  // Helper type guard for Decimal-like objects

  private isDecimal(value: unknown): value is { equals: (other: any) => boolean } {
    return (
      !!value &&
      typeof value === 'object' &&
      'equals' in value &&
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      typeof (value as any).equals === 'function'
    );
  }

  private hasToString(value: unknown): value is { toString: () => string } {
    return (
      !!value &&
      (typeof value === 'object' || typeof value === 'function') &&
      'toString' in value &&
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      typeof (value as any).toString === 'function' &&
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      (value as any).toString !== Object.prototype.toString
    );
  }
}
