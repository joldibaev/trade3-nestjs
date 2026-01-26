import { Module } from '@nestjs/common';
import { DocumentAdjustmentService } from './document-adjustment.service';
import { DocumentHistoryModule } from '../document-history/document-history.module';
import { DocumentAdjustmentController } from './document-adjustment.controller';
import { PrismaModule } from '../core/prisma/prisma.module';

import { StoreModule } from '../store/store.module';

@Module({
  imports: [PrismaModule, StoreModule, DocumentHistoryModule],
  controllers: [DocumentAdjustmentController],
  providers: [DocumentAdjustmentService],
  exports: [DocumentAdjustmentService],
})
export class DocumentAdjustmentModule {}
