import { Module } from '@nestjs/common';
import { DocumentReturnService } from './document-return.service';
import { DocumentReturnController } from './document-return.controller';
import { PrismaModule } from '../core/prisma/prisma.module';

import { StoreModule } from '../store/store.module';

@Module({
  imports: [PrismaModule, StoreModule],
  controllers: [DocumentReturnController],
  providers: [DocumentReturnService],
})
export class DocumentReturnModule {}
