import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { ApiTags, ApiQuery } from '@nestjs/swagger';
import { CashboxService } from './cashbox.service';
import { CreateCashboxDto } from '../generated/dto/cashbox/create-cashbox.dto';
import { UpdateCashboxDto } from '../generated/dto/cashbox/update-cashbox.dto';
import { parseInclude } from '../common/utils/prisma-helpers';
import { CashboxRelations } from '../generated/relations/cashbox-relations.enum';
import {
  ApiStandardResponse,
  ApiStandardResponseArray,
  ApiIncludeQuery,
} from '../common/decorators/swagger-response.decorator';
import { Cashbox } from '../generated/entities/cashbox.entity';

@ApiTags('cashboxes')
@Controller('cashboxes')
export class CashboxController {
  constructor(private readonly cashboxesService: CashboxService) { }

  @Post()
  @ApiStandardResponse(Cashbox)
  create(@Body() createCashboxDto: CreateCashboxDto) {
    return this.cashboxesService.create(createCashboxDto);
  }

  @Get()
  @ApiIncludeQuery(CashboxRelations)
  @ApiStandardResponseArray(Cashbox)
  @ApiQuery({ name: 'storeId', required: false, type: String })
  findAll(@Query('storeId') storeId?: string, @Query('include') include?: string | string[]) {
    return this.cashboxesService.findAll(storeId, parseInclude(include));
  }

  @Get(':id')
  @ApiIncludeQuery(CashboxRelations)
  @ApiStandardResponse(Cashbox)
  findOne(@Param('id') id: string, @Query('include') include?: string | string[]) {
    return this.cashboxesService.findOne(id, parseInclude(include));
  }

  @Patch(':id')
  @ApiStandardResponse(Cashbox)
  update(@Param('id') id: string, @Body() updateCashboxDto: UpdateCashboxDto) {
    return this.cashboxesService.update(id, updateCashboxDto);
  }

  @Delete(':id')
  @ApiStandardResponse(Cashbox)
  remove(@Param('id') id: string) {
    return this.cashboxesService.remove(id);
  }
}
