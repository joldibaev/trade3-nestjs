import { Module } from '@nestjs/common';
import { DocumentTransferService } from './document-transfer.service';
import { DocumentTransferController } from './document-transfer.controller';
import { PrismaModule } from '../core/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [DocumentTransferController],
  providers: [DocumentTransferService],
})
export class DocumentTransferModule {}
