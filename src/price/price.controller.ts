import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PriceService } from './price.service';
import { CreatePriceDto } from '../generated/dto/price/create-price.dto';
import { UpdatePriceDto } from '../generated/dto/price/update-price.dto';
import { parseInclude } from '../common/utils/prisma-helpers';
import { PriceRelations } from '../generated/relations/price-relations.enum';
import {
  ApiStandardResponse,
  ApiStandardResponseArray,
  ApiIncludeQuery,
} from '../common/decorators/swagger-response.decorator';
import { Price } from '../generated/entities/price.entity';

@ApiTags('prices')
@Controller('prices')
export class PriceController {
  constructor(private readonly priceService: PriceService) {}

  @Post()
  @ApiStandardResponse(Price)
  create(@Body() createPriceDto: CreatePriceDto) {
    return this.priceService.create(createPriceDto);
  }

  @Get()
  @ApiIncludeQuery(PriceRelations)
  @ApiStandardResponseArray(Price)
  findAll(@Query('include') include?: string | string[]) {
    return this.priceService.findAll(parseInclude(include));
  }

  @Get(':id')
  @ApiIncludeQuery(PriceRelations)
  @ApiStandardResponse(Price)
  findOne(
    @Param('id') id: string,
    @Query('include') include?: string | string[],
  ) {
    return this.priceService.findOne(id, parseInclude(include));
  }

  @Patch(':id')
  @ApiStandardResponse(Price)
  update(@Param('id') id: string, @Body() updatePriceDto: UpdatePriceDto) {
    return this.priceService.update(id, updatePriceDto);
  }

  @Delete(':id')
  @ApiStandardResponse(Price)
  remove(@Param('id') id: string) {
    return this.priceService.remove(id);
  }
}
