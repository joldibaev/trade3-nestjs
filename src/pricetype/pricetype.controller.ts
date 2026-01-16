import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PriceTypeService } from './pricetype.service';
import { CreatePriceTypeDto } from '../generated/dto/price-type/create-price-type.dto';
import { UpdatePriceTypeDto } from '../generated/dto/price-type/update-price-type.dto';

@ApiTags('price-types')
@Controller('price-types')
export class PriceTypeController {
  constructor(private readonly priceTypeService: PriceTypeService) {}

  @Post()
  create(@Body() createPriceTypeDto: CreatePriceTypeDto) {
    return this.priceTypeService.create(createPriceTypeDto);
  }

  @Get()
  findAll() {
    return this.priceTypeService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.priceTypeService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updatePriceTypeDto: UpdatePriceTypeDto) {
    return this.priceTypeService.update(id, updatePriceTypeDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.priceTypeService.remove(id);
  }
}
