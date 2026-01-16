import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { CashboxService } from './cashbox.service';
import { CreateCashboxDto } from '../generated/dto/cashbox/create-cashbox.dto';
import { UpdateCashboxDto } from '../generated/dto/cashbox/update-cashbox.dto';
import { parseInclude } from '../common/utils/prisma-helpers';
import { CashboxRelations } from '../generated/relations/cashbox-relations.enum';
import { ApiIncludeQuery } from '../common/decorators/swagger-response.decorator';

@ApiTags('cashboxes')
@Controller('cashboxes')
export class CashboxController {
  constructor(private readonly cashboxesService: CashboxService) {}

  @Post()
  create(@Body() createCashboxDto: CreateCashboxDto) {
    return this.cashboxesService.create(createCashboxDto);
  }

  @Get()
  @ApiIncludeQuery(CashboxRelations)
  @ApiQuery({ name: 'storeId', required: false, type: String })
  findAll(@Query('storeId') storeId?: string, @Query('include') include?: string | string[]) {
    return this.cashboxesService.findAll(storeId, parseInclude(include));
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.cashboxesService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateCashboxDto: UpdateCashboxDto) {
    return this.cashboxesService.update(id, updateCashboxDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.cashboxesService.remove(id);
  }
}
