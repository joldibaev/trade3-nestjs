import { Module } from '@nestjs/common';
import { DocumentTransferService } from './document-transfer.service';
import { DocumentTransferController } from './document-transfer.controller';
import { PrismaModule } from '../core/prisma/prisma.module';

import { StoreModule } from '../store/store.module';

@Module({
  imports: [PrismaModule, StoreModule],
  controllers: [DocumentTransferController],
  providers: [DocumentTransferService],
})
export class DocumentTransferModule {}
