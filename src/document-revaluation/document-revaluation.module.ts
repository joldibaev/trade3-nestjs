import { Module } from '@nestjs/common';

import { DocumentHistoryModule } from '../document-history/document-history.module';
import { PriceModule } from '../price/price.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StoreModule } from '../store/store.module';
import { DocumentRevaluationController } from './document-revaluation.controller';
import { DocumentRevaluationService } from './document-revaluation.service';

@Module({
  imports: [PrismaModule, StoreModule, DocumentHistoryModule, PriceModule],
  controllers: [DocumentRevaluationController],
  providers: [DocumentRevaluationService],
})
export class DocumentRevaluationModule {}
