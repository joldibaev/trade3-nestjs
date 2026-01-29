import { Module } from '@nestjs/common';

import { DocumentHistoryModule } from '../document-history/document-history.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StoreModule } from '../store/store.module';
import { DocumentPriceChangeController } from './document-price-change.controller';
import { DocumentPriceChangeService } from './document-price-change.service';

@Module({
  imports: [PrismaModule, StoreModule, DocumentHistoryModule],
  controllers: [DocumentPriceChangeController],
  providers: [DocumentPriceChangeService],
})
export class DocumentPriceChangeModule {}
