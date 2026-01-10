import { Controller, Get, Query } from '@nestjs/common';
import { StockMovementService } from './stock-movement.service';
import { ApiTags } from '@nestjs/swagger';
import {
  ApiStandardResponseArray,
  ApiIncludeQuery,
} from '../common/decorators/swagger-response.decorator';
import { parseInclude } from '../common/utils/prisma-helpers';
import { StockMovement } from '../generated/entities/stock-movement.entity';
import { StockMovementRelations } from '../generated/relations/stock-movement-relations.enum';

@ApiTags('stock-movements')
@Controller('stock-movements')
export class StockMovementController {
  constructor(private readonly stockMovementService: StockMovementService) {}

  @Get()
  @ApiIncludeQuery(StockMovementRelations)
  @ApiStandardResponseArray(StockMovement)
  findAll(@Query('include') include?: string | string[]) {
    return this.stockMovementService.findAll(parseInclude(include));
  }
}
