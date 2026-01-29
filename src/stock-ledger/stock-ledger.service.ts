import { Injectable } from '@nestjs/common';

import { Prisma, StockLedger } from '../generated/prisma/client';
import { StockMovementType } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import Decimal = Prisma.Decimal;

export interface LogStockLedgerDto {
  type: 'PURCHASE' | 'SALE' | 'RETURN' | 'ADJUSTMENT' | 'TRANSFER_IN' | 'TRANSFER_OUT';
  storeId: string;
  productId: string;
  quantity: Decimal;
  date: Date | string;
  documentId: string; // The ID of the specific document

  quantityAfter: Decimal;
  quantityBefore: Decimal;

  averagePurchasePrice: Decimal;
  transactionAmount: Decimal;

  batchId?: string;
}

@Injectable()
export class StockLedgerService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Logs a standardized StockLedger record ensuring strong relations and snapshots.
   */
  async create(tx: Prisma.TransactionClient, data: LogStockLedgerDto): Promise<StockLedger> {
    const {
      type,
      storeId,
      productId,
      quantity,
      date,
      documentId,
      quantityAfter,
      quantityBefore,
      averagePurchasePrice,
      transactionAmount,
      batchId,
    } = data;

    const dataInput: Prisma.StockLedgerUncheckedCreateInput = {
      type: type as StockMovementType,
      storeId,
      productId,
      quantity,
      date: new Date(date),

      quantityAfter,
      quantityBefore,

      averagePurchasePrice,
      transactionAmount,

      batchId,
    };

    // Map the generic documentId to the specific relation field
    if (type === 'PURCHASE') dataInput.documentPurchaseId = documentId;
    if (type === 'SALE') dataInput.documentSaleId = documentId;
    if (type === 'RETURN') dataInput.documentReturnId = documentId;
    if (type === 'ADJUSTMENT') dataInput.documentAdjustmentId = documentId;
    if (type === 'TRANSFER_IN' || type === 'TRANSFER_OUT')
      dataInput.documentTransferId = documentId;

    return tx.stockLedger.create({
      data: dataInput,
    });
  }

  async findAll(
    include?: Record<string, boolean>,
    filters?: {
      productId?: string;
      storeId?: string;
      type?: StockMovementType;
      startDate?: Date;
      endDate?: Date;
    },
  ): Promise<StockLedger[]> {
    const where: Prisma.StockLedgerWhereInput = {};

    if (filters?.productId) where.productId = filters.productId;
    if (filters?.storeId) where.storeId = filters.storeId;
    if (filters?.type) where.type = filters.type;
    if (filters?.startDate || filters?.endDate) {
      where.date = {};
      if (filters.startDate) where.date.gte = filters.startDate;
      if (filters.endDate) where.date.lte = filters.endDate;
    }

    return this.prisma.stockLedger.findMany({
      where,
      include,
      orderBy: { date: 'desc' },
    });
  }
}
