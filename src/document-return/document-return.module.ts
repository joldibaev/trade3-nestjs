import { Module } from '@nestjs/common';

import { DocumentHistoryModule } from '../document-history/document-history.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StoreModule } from '../store/store.module';
import { DocumentReturnController } from './document-return.controller';
import { DocumentReturnService } from './document-return.service';

@Module({
  imports: [PrismaModule, StoreModule, DocumentHistoryModule],
  controllers: [DocumentReturnController],
  providers: [DocumentReturnService],
  exports: [DocumentReturnService],
})
export class DocumentReturnModule {}
