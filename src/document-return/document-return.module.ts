import { Module } from '@nestjs/common';
import { DocumentReturnService } from './document-return.service';
import { DocumentLedgerModule } from '../document-ledger/document-ledger.module';
import { DocumentReturnController } from './document-return.controller';
import { PrismaModule } from '../core/prisma/prisma.module';

import { StoreModule } from '../store/store.module';

@Module({
  imports: [PrismaModule, StoreModule, DocumentLedgerModule],
  controllers: [DocumentReturnController],
  providers: [DocumentReturnService],
  exports: [DocumentReturnService],
})
export class DocumentReturnModule {}
