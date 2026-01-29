import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { DocumentAdjustmentService } from '../document-adjustment/document-adjustment.service';
import { DocumentPurchaseService } from '../document-purchase/document-purchase.service';
import { DocumentReturnService } from '../document-return/document-return.service';
import { DocumentSaleService } from '../document-sale/document-sale.service';
import { DocumentTransferService } from '../document-transfer/document-transfer.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly purchaseService: DocumentPurchaseService,
    private readonly saleService: DocumentSaleService,
    private readonly returnService: DocumentReturnService,
    private readonly adjustmentService: DocumentAdjustmentService,
    private readonly transferService: DocumentTransferService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleScheduledDocuments(): Promise<void> {
    this.logger.log('Running scheduled documents check...');
    const now = new Date();

    // 1. Purchases
    const purchases = await this.prisma.documentPurchase.findMany({
      where: { status: 'SCHEDULED', date: { lte: now } },
    });
    for (const doc of purchases) {
      try {
        this.logger.log(`Auto-completing Purchase ${doc.code}`);
        await this.purchaseService.updateStatus(doc.id, 'COMPLETED');
      } catch (e) {
        this.logger.error(`Failed to auto-complete Purchase ${doc.id}`, e);
      }
    }

    // 2. Sales
    const sales = await this.prisma.documentSale.findMany({
      where: { status: 'SCHEDULED', date: { lte: now } },
    });
    for (const doc of sales) {
      try {
        this.logger.log(`Auto-completing Sale ${doc.code}`);
        await this.saleService.updateStatus(doc.id, 'COMPLETED');
      } catch (e) {
        this.logger.error(`Failed to auto-complete Sale ${doc.id}`, e);
      }
    }

    // 3. Returns
    const returns = await this.prisma.documentReturn.findMany({
      where: { status: 'SCHEDULED', date: { lte: now } },
    });
    for (const doc of returns) {
      try {
        this.logger.log(`Auto-completing Return ${doc.code}`);
        await this.returnService.updateStatus(doc.id, 'COMPLETED');
      } catch (e) {
        this.logger.error(`Failed to auto-complete Return ${doc.id}`, e);
      }
    }

    // 4. Adjustments
    const adjustments = await this.prisma.documentAdjustment.findMany({
      where: { status: 'SCHEDULED', date: { lte: now } },
    });
    for (const doc of adjustments) {
      try {
        this.logger.log(`Auto-completing Adjustment ${doc.code}`);
        await this.adjustmentService.updateStatus(doc.id, 'COMPLETED');
      } catch (e) {
        this.logger.error(`Failed to auto-complete Adjustment ${doc.id}`, e);
      }
    }

    // 5. Transfers
    const transfers = await this.prisma.documentTransfer.findMany({
      where: { status: 'SCHEDULED', date: { lte: now } },
    });
    for (const doc of transfers) {
      try {
        this.logger.log(`Auto-completing Transfer ${doc.code}`);
        await this.transferService.updateStatus(doc.id, 'COMPLETED');
      } catch (e) {
        this.logger.error(`Failed to auto-complete Transfer ${doc.id}`, e);
      }
    }
  }
}
