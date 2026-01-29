import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { ApiIncludeQuery } from '../common/decorators/swagger-response.decorator';
import { parseInclude } from '../common/utils/prisma-helpers';
import { Price } from '../generated/prisma/client';
import { CreatePriceDto } from '../generated/types/backend/dto/price/create-price.dto';
import { UpdatePriceDto } from '../generated/types/backend/dto/price/update-price.dto';
import { PriceRelations } from '../generated/types/backend/relations';
import { PriceService } from './price.service';

@ApiTags('prices')
@Controller('prices')
export class PriceController {
  constructor(private readonly priceService: PriceService) {}

  @Post()
  create(@Body() createPriceDto: CreatePriceDto): Promise<Price> {
    return this.priceService.create(createPriceDto);
  }

  @Get()
  @ApiIncludeQuery(PriceRelations)
  findAll(@Query('include') include?: string | string[]): Promise<Price[]> {
    return this.priceService.findAll(parseInclude(include));
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<Price> {
    return this.priceService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updatePriceDto: UpdatePriceDto): Promise<Price> {
    return this.priceService.update(id, updatePriceDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string): Promise<Price> {
    return this.priceService.remove(id);
  }
}
