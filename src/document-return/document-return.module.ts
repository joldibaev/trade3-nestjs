import { Module } from '@nestjs/common';
import { DocumentReturnService } from './document-return.service';
import { DocumentHistoryModule } from '../document-history/document-history.module';
import { DocumentReturnController } from './document-return.controller';
import { PrismaModule } from '../core/prisma/prisma.module';

import { StoreModule } from '../store/store.module';

@Module({
  imports: [PrismaModule, StoreModule, DocumentHistoryModule],
  controllers: [DocumentReturnController],
  providers: [DocumentReturnService],
  exports: [DocumentReturnService],
})
export class DocumentReturnModule {}
