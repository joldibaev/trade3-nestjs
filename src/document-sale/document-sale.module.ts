import { Module } from '@nestjs/common';

import { DocumentHistoryModule } from '../document-history/document-history.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StoreModule } from '../store/store.module';
import { DocumentSaleController } from './document-sale.controller';
import { DocumentSaleService } from './document-sale.service';

@Module({
  imports: [PrismaModule, StoreModule, DocumentHistoryModule],
  controllers: [DocumentSaleController],
  providers: [DocumentSaleService],
  exports: [DocumentSaleService],
})
export class DocumentSaleModule {}
