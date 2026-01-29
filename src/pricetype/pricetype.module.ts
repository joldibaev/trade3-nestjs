import { Module } from '@nestjs/common';

import { PriceTypeController } from './pricetype.controller';
import { PriceTypeService } from './pricetype.service';

@Module({
  controllers: [PriceTypeController],
  providers: [PriceTypeService],
  exports: [PriceTypeService],
})
export class PriceTypeModule {}
