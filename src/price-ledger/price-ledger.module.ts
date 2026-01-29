import { Module } from '@nestjs/common';

import { PriceLedgerController } from './price-ledger.controller';
import { PriceLedgerService } from './price-ledger.service';

@Module({
  providers: [PriceLedgerService],
  controllers: [PriceLedgerController],
  exports: [PriceLedgerService],
})
export class PriceLedgerModule {}
