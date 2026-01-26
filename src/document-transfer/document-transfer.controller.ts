import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { DocumentTransferService } from './document-transfer.service';
import {
  CreateDocumentTransferDto,
  CreateDocumentTransferItemDto,
} from './dto/create-document-transfer.dto';
import { ApiTags } from '@nestjs/swagger';
import { UpdateDocumentStatusDto } from '../document-purchase/dto/update-document-status.dto';

@ApiTags('document-transfers')
@Controller('document-transfers')
export class DocumentTransferController {
  constructor(private readonly documentTransferService: DocumentTransferService) {}

  @Post()
  create(@Body() createDocumentTransferDto: CreateDocumentTransferDto) {
    return this.documentTransferService.create(createDocumentTransferDto);
  }

  @Get()
  findAll() {
    return this.documentTransferService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.documentTransferService.findOne(id);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() updateStatusDto: UpdateDocumentStatusDto) {
    return this.documentTransferService.updateStatus(id, updateStatusDto.status);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateDto: CreateDocumentTransferDto) {
    return this.documentTransferService.update(id, updateDto);
  }

  @Post(':id/items')
  addItem(@Param('id') id: string, @Body() dto: CreateDocumentTransferItemDto) {
    return this.documentTransferService.addItem(id, dto);
  }

  @Patch(':id/items/:itemId')
  updateItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: CreateDocumentTransferItemDto,
  ) {
    return this.documentTransferService.updateItem(id, itemId, dto);
  }

  @Delete(':id/items/:itemId')
  removeItem(@Param('id') id: string, @Param('itemId') itemId: string) {
    return this.documentTransferService.removeItem(id, itemId);
  }
}
