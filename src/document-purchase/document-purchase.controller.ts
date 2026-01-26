import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { DocumentPurchaseService } from './document-purchase.service';
import {
  CreateDocumentPurchaseDto,
  CreateDocumentPurchaseItemDto,
  CreateDocumentPurchaseItemsDto,
  RemoveDocumentPurchaseItemsDto,
} from './dto/create-document-purchase.dto';
import { UpdateDocumentPurchaseDto } from './dto/update-document-purchase.dto';
import { UpdateDocumentStatusDto } from './dto/update-document-status.dto';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('document-purchases')
@Controller('document-purchases')
export class DocumentPurchaseController {
  constructor(private readonly documentPurchaseService: DocumentPurchaseService) {}

  @Post()
  create(@Body() createDocumentPurchaseDto: CreateDocumentPurchaseDto) {
    return this.documentPurchaseService.create(createDocumentPurchaseDto);
  }

  @Get('summary')
  getSummary() {
    return this.documentPurchaseService.getSummary();
  }

  @Get()
  findAll() {
    return this.documentPurchaseService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.documentPurchaseService.findOne(id);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() updateDocumentStatusDto: UpdateDocumentStatusDto) {
    return this.documentPurchaseService.updateStatus(id, updateDocumentStatusDto.status);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateDto: UpdateDocumentPurchaseDto) {
    return this.documentPurchaseService.update(id, updateDto);
  }

  @Post(':id/items')
  addItems(@Param('id') id: string, @Body() dto: CreateDocumentPurchaseItemsDto) {
    return this.documentPurchaseService.addItems(id, dto.items);
  }

  @Patch(':id/items/:itemId')
  updateItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() item: CreateDocumentPurchaseItemDto,
  ) {
    return this.documentPurchaseService.updateItem(id, itemId, item);
  }

  @Delete(':id/items')
  removeItems(@Param('id') id: string, @Body() dto: RemoveDocumentPurchaseItemsDto) {
    return this.documentPurchaseService.removeItems(id, dto.productIds);
  }
}
