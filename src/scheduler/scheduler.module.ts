import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

import { DocumentAdjustmentModule } from '../document-adjustment/document-adjustment.module';
import { DocumentPurchaseModule } from '../document-purchase/document-purchase.module';
import { DocumentReturnModule } from '../document-return/document-return.module';
import { DocumentSaleModule } from '../document-sale/document-sale.module';
import { DocumentTransferModule } from '../document-transfer/document-transfer.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SchedulerService } from './scheduler.service';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    DocumentPurchaseModule,
    DocumentSaleModule,
    DocumentReturnModule,
    DocumentAdjustmentModule,
    DocumentTransferModule,
  ],
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerCoreModule {}
