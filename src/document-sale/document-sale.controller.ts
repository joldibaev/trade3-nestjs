import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { DocumentSaleService } from './document-sale.service';
import { CreateDocumentSaleDto } from './dto/create-document-sale.dto';
import { ApiTags } from '@nestjs/swagger';
import { UpdateDocumentStatusDto } from '../document-purchase/dto/update-document-status.dto';
import {
  ApiStandardResponse,
  ApiStandardResponseArray,
} from '../common/decorators/swagger-response.decorator';
import { DocumentSale } from '../generated/entities/document-sale.entity';

@ApiTags('document-sales')
@Controller('document-sales')
export class DocumentSaleController {
  constructor(private readonly documentSaleService: DocumentSaleService) {}

  @Post()
  @ApiStandardResponse(DocumentSale)
  create(@Body() createDocumentSaleDto: CreateDocumentSaleDto) {
    return this.documentSaleService.create(createDocumentSaleDto);
  }

  @Get()
  @ApiStandardResponseArray(DocumentSale)
  findAll() {
    return this.documentSaleService.findAll();
  }

  @Get(':id')
  @ApiStandardResponse(DocumentSale)
  findOne(@Param('id') id: string) {
    return this.documentSaleService.findOne(id);
  }

  @Patch(':id/status')
  @ApiStandardResponse(DocumentSale)
  updateStatus(@Param('id') id: string, @Body() updateStatusDto: UpdateDocumentStatusDto) {
    return this.documentSaleService.updateStatus(id, updateStatusDto.status);
  }

  @Patch(':id')
  @ApiStandardResponse(DocumentSale)
  update(@Param('id') id: string, @Body() updateDto: CreateDocumentSaleDto) {
    return this.documentSaleService.update(id, updateDto);
  }

  @Delete(':id')
  @ApiStandardResponse(DocumentSale)
  remove(@Param('id') id: string) {
    return this.documentSaleService.remove(id);
  }
}
