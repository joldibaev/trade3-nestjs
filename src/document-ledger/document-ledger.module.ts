import { Module, Global } from '@nestjs/common';
import { DocumentLedgerService } from './document-ledger.service';
import { PrismaModule } from '../core/prisma/prisma.module';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [DocumentLedgerService],
  exports: [DocumentLedgerService],
})
export class DocumentLedgerModule {}
