import { Module } from '@nestjs/common';
import { DocumentPriceChangeService } from './document-price-change.service';
import { DocumentPriceChangeController } from './document-price-change.controller';
import { PrismaModule } from '../core/prisma/prisma.module';
import { StoreModule } from '../store/store.module';
import { DocumentLedgerModule } from '../document-ledger/document-ledger.module';

@Module({
  imports: [PrismaModule, StoreModule, DocumentLedgerModule],
  controllers: [DocumentPriceChangeController],
  providers: [DocumentPriceChangeService],
})
export class DocumentPriceChangeModule {}
