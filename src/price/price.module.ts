import { Module } from '@nestjs/common';

import { PriceController } from './price.controller';
import { PriceService } from './price.service';
import { PriceMovementService } from './price-movement.service';

@Module({
  controllers: [PriceController],
  providers: [PriceService, PriceMovementService],
  exports: [PriceService, PriceMovementService],
})
export class PriceModule {}
