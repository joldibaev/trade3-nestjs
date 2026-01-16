import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PriceService } from './price.service';
import { CreatePriceDto } from '../generated/dto/price/create-price.dto';
import { UpdatePriceDto } from '../generated/dto/price/update-price.dto';
import { parseInclude } from '../common/utils/prisma-helpers';
import { PriceRelations } from '../generated/relations/price-relations.enum';
import { ApiIncludeQuery } from '../common/decorators/swagger-response.decorator';

@ApiTags('prices')
@Controller('prices')
export class PriceController {
  constructor(private readonly priceService: PriceService) {}

  @Post()
  create(@Body() createPriceDto: CreatePriceDto) {
    return this.priceService.create(createPriceDto);
  }

  @Get()
  @ApiIncludeQuery(PriceRelations)
  findAll(@Query('include') include?: string | string[]) {
    return this.priceService.findAll(parseInclude(include));
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.priceService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updatePriceDto: UpdatePriceDto) {
    return this.priceService.update(id, updatePriceDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.priceService.remove(id);
  }
}
