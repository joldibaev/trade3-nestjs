import { Module } from '@nestjs/common';
import { DocumentAdjustmentService } from './document-adjustment.service';
import { DocumentLedgerModule } from '../document-ledger/document-ledger.module';
import { DocumentAdjustmentController } from './document-adjustment.controller';
import { PrismaModule } from '../core/prisma/prisma.module';

import { StoreModule } from '../store/store.module';

@Module({
  imports: [PrismaModule, StoreModule, DocumentLedgerModule],
  controllers: [DocumentAdjustmentController],
  providers: [DocumentAdjustmentService],
  exports: [DocumentAdjustmentService],
})
export class DocumentAdjustmentModule {}
