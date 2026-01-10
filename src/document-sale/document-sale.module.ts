import { Module } from '@nestjs/common';
import { DocumentSaleService } from './document-sale.service';
import { DocumentSaleController } from './document-sale.controller';
import { PrismaModule } from '../core/prisma/prisma.module';

import { StoreModule } from '../store/store.module';

@Module({
  imports: [PrismaModule, StoreModule],
  controllers: [DocumentSaleController],
  providers: [DocumentSaleService],
  exports: [DocumentSaleService],
})
export class DocumentSaleModule {}
