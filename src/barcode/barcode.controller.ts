import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { ApiIncludeQuery } from '../common/decorators/swagger-response.decorator';
import { parseInclude } from '../common/utils/prisma-helpers';
import { Barcode } from '../generated/prisma/client';
import { BarcodeRelations } from '../generated/types/backend/relations';
import { BarcodeService } from './barcode.service';
import { CreateBarcodeDto } from './dto/create-barcode.dto';
import { UpdateBarcodeDto } from './dto/update-barcode.dto';

@ApiTags('barcodes')
@Controller('barcodes')
export class BarcodeController {
  constructor(private readonly barcodeService: BarcodeService) {}

  @Post()
  create(@Body() createBarcodeDto: CreateBarcodeDto): Promise<Barcode> {
    return this.barcodeService.create(createBarcodeDto);
  }

  @Get()
  @ApiIncludeQuery(BarcodeRelations)
  findAll(@Query('include') include?: string | string[]): Promise<Barcode[]> {
    return this.barcodeService.findAll(parseInclude(include));
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<Barcode> {
    return this.barcodeService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateBarcodeDto: UpdateBarcodeDto): Promise<Barcode> {
    return this.barcodeService.update(id, updateBarcodeDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string): Promise<Barcode> {
    return this.barcodeService.remove(id);
  }
}
