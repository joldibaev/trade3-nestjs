import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SchedulerService } from './scheduler.service';
import { DocumentPurchaseModule } from '../../document-purchase/document-purchase.module';
import { DocumentSaleModule } from '../../document-sale/document-sale.module';
import { DocumentReturnModule } from '../../document-return/document-return.module';
import { DocumentAdjustmentModule } from '../../document-adjustment/document-adjustment.module';
import { DocumentTransferModule } from '../../document-transfer/document-transfer.module';
import { PrismaModule } from '../prisma/prisma.module';

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
