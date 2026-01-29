import { Module } from '@nestjs/common';

import { DocumentHistoryModule } from '../document-history/document-history.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StoreModule } from '../store/store.module';
import { DocumentPurchaseController } from './document-purchase.controller';
import { DocumentPurchaseService } from './document-purchase.service';

@Module({
  imports: [PrismaModule, StoreModule, DocumentHistoryModule],
  controllers: [DocumentPurchaseController],
  providers: [DocumentPurchaseService],
  exports: [DocumentPurchaseService],
})
export class DocumentPurchaseModule {}
