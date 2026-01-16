import { Controller, Get, Query } from '@nestjs/common';
import { StockMovementService } from './stock-movement.service';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { ApiIncludeQuery } from '../common/decorators/swagger-response.decorator';
import { parseInclude } from '../common/utils/prisma-helpers';
import { StockMovementRelations } from '../generated/relations/stock-movement-relations.enum';
import { StockMovementType } from '../generated/prisma/enums';

@ApiTags('stock-movements')
@Controller('stock-movements')
export class StockMovementController {
  constructor(private readonly stockMovementService: StockMovementService) {}

  @Get()
  @ApiIncludeQuery(StockMovementRelations)
  @ApiQuery({ name: 'productId', required: false })
  @ApiQuery({ name: 'storeId', required: false })
  @ApiQuery({ name: 'type', enum: StockMovementType, required: false })
  @ApiQuery({ name: 'startDate', required: false, type: Date })
  @ApiQuery({ name: 'endDate', required: false, type: Date })
  findAll(
    @Query('include') include?: string | string[],
    @Query('productId') productId?: string,
    @Query('storeId') storeId?: string,
    @Query('type') type?: StockMovementType,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.stockMovementService.findAll(parseInclude(include), {
      productId,
      storeId,
      type,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
  }
}
