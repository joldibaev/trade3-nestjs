import { Injectable } from '@nestjs/common';

import { Prisma } from '../generated/prisma/client';
import Decimal = Prisma.Decimal;

export interface PriceChangeItem {
  productId: string;
  priceTypeId: string;
  oldValue: Decimal;
  newValue: Decimal;
}

export interface ApplyPriceChangesOptions {
  documentId: string;
  date: Date;
  items: PriceChangeItem[];
}

/**
 * Сервис для управления движениями цен.
 * Аналог InventoryService, но для Price/PriceLedger.
 */
@Injectable()
export class PriceMovementService {
  /**
   * Применить изменения цен: записать в PriceLedger и обновить Price.
   */
  async applyPriceChanges(
    tx: Prisma.TransactionClient,
    options: ApplyPriceChangesOptions,
  ): Promise<void> {
    const { documentId, date, items } = options;

    for (const item of items) {
      // 1. Запись в PriceLedger
      await tx.priceLedger.create({
        data: {
          productId: item.productId,
          priceTypeId: item.priceTypeId,
          valueBefore: item.oldValue,
          value: item.newValue,
          documentRevaluationId: documentId,
          batchId: documentId,
          date: date,
        },
      });

      // 2. Обновить текущую цену
      await this.rebalanceProductPrice(tx, item.productId, item.priceTypeId);
    }
  }

  /**
   * Отменить (revert) изменения цен: создать обратную запись в PriceLedger.
   */
  async revertPriceChanges(
    tx: Prisma.TransactionClient,
    options: ApplyPriceChangesOptions,
  ): Promise<void> {
    const { documentId, date, items } = options;

    for (const item of items) {
      // Обратная запись: newValue → oldValue
      await tx.priceLedger.create({
        data: {
          productId: item.productId,
          priceTypeId: item.priceTypeId,
          valueBefore: item.newValue,
          value: item.oldValue,
          documentRevaluationId: documentId,
          batchId: documentId,
          date: date,
        },
      });

      // Пересчитать текущую цену
      await this.rebalanceProductPrice(tx, item.productId, item.priceTypeId);
    }
  }

  /**
   * Пересчитать текущую цену на основе последней записи в PriceLedger.
   */
  private async rebalanceProductPrice(
    tx: Prisma.TransactionClient,
    productId: string,
    priceTypeId: string,
  ): Promise<void> {
    // Найти последнюю запись
    const latestEntry = await tx.priceLedger.findFirst({
      where: { productId, priceTypeId },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });

    if (latestEntry) {
      // Обновить Price
      await tx.price.upsert({
        where: {
          productId_priceTypeId: { productId, priceTypeId },
        },
        create: {
          productId,
          priceTypeId,
          value: latestEntry.value,
        },
        update: {
          value: latestEntry.value,
        },
      });
    } else {
      // Нет истории — удалить цену
      try {
        await tx.price.delete({
          where: { productId_priceTypeId: { productId, priceTypeId } },
        });
      } catch {
        // Игнорировать если не существует
      }
    }
  }
}
