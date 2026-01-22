import { Module } from '@nestjs/common';
import { DocumentTransferService } from './document-transfer.service';
import { DocumentTransferController } from './document-transfer.controller';
import { PrismaModule } from '../core/prisma/prisma.module';

import { StoreModule } from '../store/store.module';

import { DocumentLedgerModule } from '../document-ledger/document-ledger.module';

@Module({
  imports: [PrismaModule, StoreModule, DocumentLedgerModule],
  controllers: [DocumentTransferController],
  providers: [DocumentTransferService],
  exports: [DocumentTransferService],
})
export class DocumentTransferModule {}
