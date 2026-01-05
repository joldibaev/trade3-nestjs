import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { BarcodeService } from './barcode.service';
import { CreateBarcodeDto } from './dto/create-barcode.dto';
import { UpdateBarcodeDto } from './dto/update-barcode.dto';
import { parseInclude } from '../common/utils/prisma-helpers';
import { BarcodeRelations } from '../generated/relations/barcode-relations.enum';
import {
  ApiStandardResponse,
  ApiStandardResponseArray,
  ApiIncludeQuery,
} from '../common/decorators/swagger-response.decorator';
import { Barcode } from '../generated/entities/barcode.entity';

@ApiTags('barcodes')
@Controller('barcodes')
export class BarcodeController {
  constructor(private readonly barcodeService: BarcodeService) {}

  @Post()
  @ApiStandardResponse(Barcode)
  create(@Body() createBarcodeDto: CreateBarcodeDto) {
    return this.barcodeService.create(createBarcodeDto);
  }

  @Get()
  @ApiIncludeQuery(BarcodeRelations)
  @ApiStandardResponseArray(Barcode)
  findAll(@Query('include') include?: string | string[]) {
    return this.barcodeService.findAll(parseInclude(include));
  }

  @Get(':id')
  @ApiIncludeQuery(BarcodeRelations)
  @ApiStandardResponse(Barcode)
  findOne(
    @Param('id') id: string,
    @Query('include') include?: string | string[],
  ) {
    return this.barcodeService.findOne(id, parseInclude(include));
  }

  @Patch(':id')
  @ApiStandardResponse(Barcode)
  update(@Param('id') id: string, @Body() updateBarcodeDto: UpdateBarcodeDto) {
    return this.barcodeService.update(id, updateBarcodeDto);
  }

  @Delete(':id')
  @ApiStandardResponse(Barcode)
  remove(@Param('id') id: string) {
    return this.barcodeService.remove(id);
  }
}
