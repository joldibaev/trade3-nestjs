import { Module } from '@nestjs/common';
import { PriceTypeService } from './pricetype.service';
import { PriceTypeController } from './pricetype.controller';

@Module({
  controllers: [PriceTypeController],
  providers: [PriceTypeService],
  exports: [PriceTypeService],
})
export class PriceTypeModule {}
