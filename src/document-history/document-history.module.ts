import { Global, Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { DocumentHistoryService } from './document-history.service';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [DocumentHistoryService],
  exports: [DocumentHistoryService],
})
export class DocumentHistoryModule {}
