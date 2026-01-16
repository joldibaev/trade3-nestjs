import { Controller, Get, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { PriceHistoryService } from './price-history.service';
import { PriceHistoryRelations } from '../generated/relations/price-history-relations.enum';
import { ApiIncludeQuery } from '../common/decorators/swagger-response.decorator';
import { parseInclude } from '../common/utils/prisma-helpers';

@ApiTags('price-histories')
@Controller('price-histories')
export class PriceHistoryController {
  constructor(private readonly priceHistoryService: PriceHistoryService) {}

  @Get()
  @ApiIncludeQuery(PriceHistoryRelations)
  @ApiQuery({ name: 'productId', required: false })
  @ApiQuery({ name: 'priceTypeId', required: false })
  findAll(
    @Query('include') include?: string | string[],
    @Query('productId') productId?: string,
    @Query('priceTypeId') priceTypeId?: string,
  ) {
    return this.priceHistoryService.findAll(parseInclude(include), {
      productId,
      priceTypeId,
    });
  }
}
