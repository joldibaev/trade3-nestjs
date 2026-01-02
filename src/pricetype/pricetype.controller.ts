import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PriceTypeService } from './pricetype.service';
import { CreatePriceTypeDto } from '../generated/dto/pricetype/create-pricetype.dto';
import { UpdatePriceTypeDto } from '../generated/dto/pricetype/update-pricetype.dto';
import {
  ApiStandardResponse,
  ApiStandardResponseArray,
} from '../common/decorators/swagger-response.decorator';
import { PriceType } from '../generated/entities/pricetype.entity';

@ApiTags('price-types')
@Controller('price-types')
export class PriceTypeController {
  constructor(private readonly priceTypeService: PriceTypeService) {}

  @Post()
  @ApiStandardResponse(PriceType)
  create(@Body() createPriceTypeDto: CreatePriceTypeDto) {
    return this.priceTypeService.create(createPriceTypeDto);
  }

  @Get()
  @ApiStandardResponseArray(PriceType)
  findAll() {
    return this.priceTypeService.findAll();
  }

  @Get(':id')
  @ApiStandardResponse(PriceType)
  findOne(@Param('id') id: string) {
    return this.priceTypeService.findOne(id);
  }

  @Patch(':id')
  @ApiStandardResponse(PriceType)
  update(
    @Param('id') id: string,
    @Body() updatePriceTypeDto: UpdatePriceTypeDto,
  ) {
    return this.priceTypeService.update(id, updatePriceTypeDto);
  }

  @Delete(':id')
  @ApiStandardResponse(PriceType)
  remove(@Param('id') id: string) {
    return this.priceTypeService.remove(id);
  }
}
