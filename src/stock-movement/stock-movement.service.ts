import { Injectable } from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { StockMovementType } from '../generated/prisma/enums';
import Decimal = Prisma.Decimal;

export interface LogStockMovementDto {
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
  userId?: string;
}

@Injectable()
export class StockMovementService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Logs a standardized StockMovement record ensuring strong relations and snapshots.
   */
  async create(tx: Prisma.TransactionClient, data: LogStockMovementDto) {
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
      userId,
    } = data;

    const dataInput: Prisma.StockMovementUncheckedCreateInput = {
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
      userId,
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

  async findAll(
    include?: Record<string, boolean>,
    filters?: {
      productId?: string;
      storeId?: string;
      type?: StockMovementType;
      startDate?: Date;
      endDate?: Date;
    },
  ) {
    const where: Prisma.StockMovementWhereInput = {};

    if (filters?.productId) where.productId = filters.productId;
    if (filters?.storeId) where.storeId = filters.storeId;
    if (filters?.type) where.type = filters.type;
    if (filters?.startDate || filters?.endDate) {
      where.date = {};
      if (filters.startDate) where.date.gte = filters.startDate;
      if (filters.endDate) where.date.lte = filters.endDate;
    }

    return this.prisma.stockMovement.findMany({
      where,
      include,
      orderBy: { date: 'desc' },
    });
  }
}
