import { Controller, Get, Query } from '@nestjs/common';
import { StockLedgerService } from './stock-ledger.service';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { parseInclude } from '../common/utils/prisma-helpers';
// import { StockLedgerRelations } from '../generated/types/backend/relations/stock-ledger-relations.enum'; // Assume this might be generated later or I skip it for now
import { StockMovementType } from '../generated/prisma/enums';

@ApiTags('stock-ledgers')
@Controller('stock-ledgers')
export class StockLedgerController {
  constructor(private readonly stockLedgerService: StockLedgerService) {}

  @Get()
  // @ApiIncludeQuery(StockLedgerRelations) // Commented out to avoid build error if enum not generated yet
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
    return this.stockLedgerService.findAll(parseInclude(include), {
      productId,
      storeId,
      type,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
  }
}
