import { Module, Global } from '@nestjs/common';
import { DocumentHistoryService } from './document-history.service';
import { PrismaModule } from '../core/prisma/prisma.module';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [DocumentHistoryService],
  exports: [DocumentHistoryService],
})
export class DocumentHistoryModule {}
