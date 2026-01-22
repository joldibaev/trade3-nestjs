import { Module } from '@nestjs/common';
import { DocumentSaleService } from './document-sale.service';
import { DocumentLedgerModule } from '../document-ledger/document-ledger.module';
import { DocumentSaleController } from './document-sale.controller';
import { PrismaModule } from '../core/prisma/prisma.module';

import { StoreModule } from '../store/store.module';

@Module({
  imports: [PrismaModule, StoreModule, DocumentLedgerModule],
  controllers: [DocumentSaleController],
  providers: [DocumentSaleService],
  exports: [DocumentSaleService],
})
export class DocumentSaleModule {}
