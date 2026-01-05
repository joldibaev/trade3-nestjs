import { Module } from '@nestjs/common';
import { CashboxService } from './cashbox.service';
import { CashboxController } from './cashbox.controller';

@Module({
  controllers: [CashboxController],
  providers: [CashboxService],
  exports: [CashboxService],
})
export class CashboxModule {}
