import { Module } from '@nestjs/common';
import { DocumentAdjustmentService } from './document-adjustment.service';
import { DocumentAdjustmentController } from './document-adjustment.controller';
import { PrismaModule } from '../core/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [DocumentAdjustmentController],
  providers: [DocumentAdjustmentService],
})
export class DocumentAdjustmentModule {}
