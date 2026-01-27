import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { DocumentSaleService } from './document-sale.service';
import { CreateDocumentSaleDto } from './dto/create-document-sale.dto';
import { CreateDocumentSaleItemsDto } from './dto/create-document-sale-items.dto';
import { RemoveDocumentSaleItemsDto } from './dto/remove-document-sale-items.dto';
import { UpdateDocumentSaleItemDto } from './dto/update-document-sale-item.dto';
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

  @Get('summary')
  getSummary() {
    return this.documentSaleService.getSummary();
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
  update(@Param('id') id: string, @Body() updateDto: CreateDocumentSaleDto) {
    return this.documentSaleService.update(id, updateDto);
  }

  @Post(':id/items')
  addItems(@Param('id') id: string, @Body() dto: CreateDocumentSaleItemsDto) {
    return this.documentSaleService.addItems(id, dto.items);
  }

  @Patch(':id/items/:itemId')
  updateItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateDocumentSaleItemDto,
  ) {
    return this.documentSaleService.updateItem(id, itemId, dto);
  }

  @Delete(':id/items')
  removeItems(@Param('id') id: string, @Body() dto: RemoveDocumentSaleItemsDto) {
    return this.documentSaleService.removeItems(id, dto.itemIds);
  }
}
