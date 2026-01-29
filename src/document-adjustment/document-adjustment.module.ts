import { Module } from '@nestjs/common';

import { DocumentHistoryModule } from '../document-history/document-history.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StoreModule } from '../store/store.module';
import { DocumentAdjustmentController } from './document-adjustment.controller';
import { DocumentAdjustmentService } from './document-adjustment.service';

@Module({
  imports: [PrismaModule, StoreModule, DocumentHistoryModule],
  controllers: [DocumentAdjustmentController],
  providers: [DocumentAdjustmentService],
  exports: [DocumentAdjustmentService],
})
export class DocumentAdjustmentModule {}
