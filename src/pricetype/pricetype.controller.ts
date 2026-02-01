import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { PriceType } from '../generated/prisma/client';
import { CreatePriceTypeDto } from '../generated/types/backend/dto/price-type/create-price-type.dto';
import { UpdatePriceTypeDto } from '../generated/types/backend/dto/price-type/update-price-type.dto';
import { PriceTypeService } from './pricetype.service';

@ApiTags('price-types')
@Controller('price-types')
export class PriceTypeController {
  constructor(private readonly priceTypeService: PriceTypeService) {}

  @Post()
  create(@Body() createPriceTypeDto: CreatePriceTypeDto): Promise<PriceType> {
    return this.priceTypeService.create(createPriceTypeDto);
  }

  @Get()
  findAll(): Promise<PriceType[]> {
    return this.priceTypeService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<PriceType> {
    return this.priceTypeService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updatePriceTypeDto: UpdatePriceTypeDto,
  ): Promise<PriceType> {
    return this.priceTypeService.update(id, updatePriceTypeDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string): Promise<PriceType> {
    return this.priceTypeService.remove(id);
  }
}
