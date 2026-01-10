import { Module } from '@nestjs/common';
import { DocumentPurchaseService } from './document-purchase.service';
import { DocumentPurchaseController } from './document-purchase.controller';
import { PrismaModule } from '../core/prisma/prisma.module';

import { StoreModule } from '../store/store.module';

@Module({
  imports: [PrismaModule, StoreModule],
  controllers: [DocumentPurchaseController],
  providers: [DocumentPurchaseService],
  exports: [DocumentPurchaseService],
})
export class DocumentPurchaseModule {}
