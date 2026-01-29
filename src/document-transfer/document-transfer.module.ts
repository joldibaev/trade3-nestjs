import { Module } from '@nestjs/common';

import { DocumentHistoryModule } from '../document-history/document-history.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StoreModule } from '../store/store.module';
import { DocumentTransferController } from './document-transfer.controller';
import { DocumentTransferService } from './document-transfer.service';

@Module({
  imports: [PrismaModule, StoreModule, DocumentHistoryModule],
  controllers: [DocumentTransferController],
  providers: [DocumentTransferService],
  exports: [DocumentTransferService],
})
export class DocumentTransferModule {}
