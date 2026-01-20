import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { DocumentSaleService } from './document-sale.service';
import { CreateDocumentSaleDto } from './dto/create-document-sale.dto';
import { ApiTags } from '@nestjs/swagger';
import { UpdateDocumentStatusDto } from '../document-purchase/dto/update-document-status.dto';

@ApiTags('document-sales')
@Controller('document-sales')
export class DocumentSaleController {
  constructor(private readonly documentSaleService: DocumentSaleService) {}

  @Post()
  create(@Body() createDocumentSaleDto: CreateDocumentSaleDto) {
    return this.documentSaleService.create(createDocumentSaleDto);
  }

  @Get()
  findAll() {
    return this.documentSaleService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.documentSaleService.findOne(id);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() updateDocumentStatusDto: UpdateDocumentStatusDto) {
    return this.documentSaleService.updateStatus(id, updateDocumentStatusDto.status);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateDto: CreateDocumentSaleDto, // Note: Update DTO for sale is reused CreateDto in original code? Checking service signature.
  ) {
    // Service.update takes CreateDocumentSaleDto as per previous view
    return this.documentSaleService.update(id, updateDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.documentSaleService.remove(id);
  }
}
