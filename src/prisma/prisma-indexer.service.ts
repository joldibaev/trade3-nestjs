import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { PrismaService } from './prisma.service';

@Injectable()
export class PrismaIndexerService implements OnModuleInit {
  private readonly logger = new Logger(PrismaIndexerService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.ensurePartialIndexes();
  }

  /**
   * Creates Partial Indexes for StockLedger nullable columns.
   * This is done at runtime to avoid bulky standard indexes on NULL values
   * without requiring manual migration files.
   */
  private async ensurePartialIndexes(): Promise<void> {
    const table = 'StockLedger';
    const indexes = [
      {
        column: 'documentPurchaseId',
        name: 'idx_stock_ledger_purchase_partial',
      },
      {
        column: 'documentSaleId',
        name: 'idx_stock_ledger_sale_partial',
      },
      {
        column: 'documentReturnId',
        name: 'idx_stock_ledger_return_partial',
      },
      {
        column: 'documentAdjustmentId',
        name: 'idx_stock_ledger_adjustment_partial',
      },
      {
        column: 'documentTransferId',
        name: 'idx_stock_ledger_transfer_partial',
      },
    ];

    this.logger.log('Checking partial indexes for StockLedger...');

    for (const idx of indexes) {
      // Create Index IF NOT EXISTS with WHERE clause (Partial Index)
      // Note: We use raw SQL because Prisma Schema does not support partial indexes yet.
      const sql = `
        CREATE INDEX IF NOT EXISTS "${idx.name}"
        ON "${table}" ("${idx.column}")
        WHERE "${idx.column}" IS NOT NULL;
      `;

      try {
        await this.prisma.$executeRawUnsafe(sql);
      } catch (e) {
        this.logger.error(`Failed to create index ${idx.name}`, e);
      }
    }

    this.logger.log('Partial indexes check completed.');
  }
}
