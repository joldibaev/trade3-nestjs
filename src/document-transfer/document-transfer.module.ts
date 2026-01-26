import { Module } from '@nestjs/common';
import { DocumentTransferService } from './document-transfer.service';
import { DocumentTransferController } from './document-transfer.controller';
import { PrismaModule } from '../core/prisma/prisma.module';

import { StoreModule } from '../store/store.module';

import { DocumentHistoryModule } from '../document-history/document-history.module';

@Module({
  imports: [PrismaModule, StoreModule, DocumentHistoryModule],
  controllers: [DocumentTransferController],
  providers: [DocumentTransferService],
  exports: [DocumentTransferService],
})
export class DocumentTransferModule {}
