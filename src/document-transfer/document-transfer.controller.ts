import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { DocumentTransferService } from './document-transfer.service';
import { CreateDocumentTransferDto } from './dto/create-document-transfer.dto';
import { CreateDocumentTransferItemDto } from './dto/create-document-transfer-item.dto';
import { CreateDocumentTransferItemsDto } from './dto/create-document-transfer-items.dto';
import { RemoveDocumentTransferItemsDto } from './dto/remove-document-transfer-items.dto';
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
  addItems(@Param('id') id: string, @Body() dto: CreateDocumentTransferItemsDto) {
    return this.documentTransferService.addItems(id, dto.items);
  }

  @Patch(':id/items/:itemId')
  updateItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: CreateDocumentTransferItemDto,
  ) {
    return this.documentTransferService.updateItem(id, itemId, dto);
  }

  @Delete(':id/items')
  removeItems(@Param('id') id: string, @Body() dto: RemoveDocumentTransferItemsDto) {
    return this.documentTransferService.removeItems(id, dto.itemIds);
  }
}
