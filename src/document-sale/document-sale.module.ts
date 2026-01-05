import { Module } from '@nestjs/common';
import { DocumentSaleService } from './document-sale.service';
import { DocumentSaleController } from './document-sale.controller';
import { PrismaModule } from '../core/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [DocumentSaleController],
  providers: [DocumentSaleService],
  exports: [DocumentSaleService],
})
export class DocumentSaleModule {}
