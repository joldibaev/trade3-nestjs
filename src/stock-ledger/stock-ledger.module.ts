import { Module, Global } from '@nestjs/common';
import { StockLedgerService } from './stock-ledger.service';
import { StockLedgerController } from './stock-ledger.controller';
import { PrismaModule } from '../core/prisma/prisma.module';

@Global()
@Module({
  imports: [PrismaModule],
  controllers: [StockLedgerController],
  providers: [StockLedgerService],
  exports: [StockLedgerService],
})
export class StockLedgerModule {}
