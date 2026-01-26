import { Module } from '@nestjs/common';
import { DocumentPriceChangeService } from './document-price-change.service';
import { DocumentPriceChangeController } from './document-price-change.controller';
import { PrismaModule } from '../core/prisma/prisma.module';
import { StoreModule } from '../store/store.module';
import { DocumentHistoryModule } from '../document-history/document-history.module';

@Module({
  imports: [PrismaModule, StoreModule, DocumentHistoryModule],
  controllers: [DocumentPriceChangeController],
  providers: [DocumentPriceChangeService],
})
export class DocumentPriceChangeModule {}
