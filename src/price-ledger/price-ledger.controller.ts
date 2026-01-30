import { Controller, Get, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';

import { parseInclude } from '../common/utils/prisma-helpers';
import { PriceLedger } from '../generated/prisma/client';
import { PriceLedgerService } from './price-ledger.service';

@ApiTags('price-ledgers')
@Controller('price-ledgers')
export class PriceLedgerController {
  constructor(private readonly priceLedgerService: PriceLedgerService) {}

  @Get()
  @ApiQuery({ name: 'productId', required: false })
  @ApiQuery({ name: 'priceTypeId', required: false })
  @ApiQuery({ name: 'startDate', required: false, type: Date })
  @ApiQuery({ name: 'endDate', required: false, type: Date })
  findAll(
    @Query('include') include?: string | string[],
    @Query('productId') productId?: string,
    @Query('priceTypeId') priceTypeId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<PriceLedger[]> {
    return this.priceLedgerService.findAll(parseInclude(include), {
      productId,
      priceTypeId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
  }
}
