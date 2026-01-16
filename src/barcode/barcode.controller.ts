import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { BarcodeService } from './barcode.service';
import { CreateBarcodeDto } from './dto/create-barcode.dto';
import { UpdateBarcodeDto } from './dto/update-barcode.dto';
import { parseInclude } from '../common/utils/prisma-helpers';
import { BarcodeRelations } from '../generated/relations/barcode-relations.enum';
import { ApiIncludeQuery } from '../common/decorators/swagger-response.decorator';

@ApiTags('barcodes')
@Controller('barcodes')
export class BarcodeController {
  constructor(private readonly barcodeService: BarcodeService) {}

  @Post()
  create(@Body() createBarcodeDto: CreateBarcodeDto) {
    return this.barcodeService.create(createBarcodeDto);
  }

  @Get()
  findAll(@Query('include') include?: string | string[]) {
    return this.barcodeService.findAll(parseInclude(include));
  }

  @Get(':id')
  @ApiIncludeQuery(BarcodeRelations)
  findOne(@Param('id') id: string, @Query('include') include?: string | string[]) {
    return this.barcodeService.findOne(id, parseInclude(include));
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateBarcodeDto: UpdateBarcodeDto) {
    return this.barcodeService.update(id, updateBarcodeDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.barcodeService.remove(id);
  }
}
