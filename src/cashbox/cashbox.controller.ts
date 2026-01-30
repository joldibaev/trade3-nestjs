import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';

import { ApiIncludeQuery } from '../common/decorators/swagger-response.decorator';
import { parseInclude } from '../common/utils/prisma-helpers';
import { Cashbox } from '../generated/prisma/client';
import { CreateCashboxDto } from '../generated/types/backend/dto/cashbox/create-cashbox.dto';
import { UpdateCashboxDto } from '../generated/types/backend/dto/cashbox/update-cashbox.dto';
import { CashboxRelations } from '../generated/types/backend/relations/cashbox-relations.enum';
import { CashboxService } from './cashbox.service';

@ApiTags('cashboxes')
@Controller('cashboxes')
export class CashboxController {
  constructor(private readonly cashboxesService: CashboxService) {}

  @Post()
  create(@Body() createCashboxDto: CreateCashboxDto): Promise<Cashbox> {
    return this.cashboxesService.create(createCashboxDto);
  }

  @Get()
  @ApiIncludeQuery(CashboxRelations)
  @ApiQuery({ name: 'storeId', required: false, type: String })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  findAll(
    @Query('storeId') storeId?: string,
    @Query('isActive') isActive?: string,
    @Query('include') include?: string | string[],
  ): Promise<Cashbox[]> {
    const active = isActive === 'true' ? true : isActive === 'false' ? false : undefined;
    return this.cashboxesService.findAll(storeId, active, parseInclude(include));
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<Cashbox> {
    return this.cashboxesService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateCashboxDto: UpdateCashboxDto): Promise<Cashbox> {
    return this.cashboxesService.update(id, updateCashboxDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string): Promise<Cashbox> {
    return this.cashboxesService.remove(id);
  }
}
