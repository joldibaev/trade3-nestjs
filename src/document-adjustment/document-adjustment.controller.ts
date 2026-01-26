import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { DocumentAdjustmentService } from './document-adjustment.service';
import {
  CreateDocumentAdjustmentDto,
  CreateDocumentAdjustmentItemDto,
  CreateDocumentAdjustmentItemsDto,
  RemoveDocumentAdjustmentItemsDto,
} from './dto/create-document-adjustment.dto';
import { ApiTags } from '@nestjs/swagger';
import { UpdateDocumentStatusDto } from '../document-purchase/dto/update-document-status.dto';

@ApiTags('document-adjustments')
@Controller('document-adjustments')
export class DocumentAdjustmentController {
  constructor(private readonly documentAdjustmentService: DocumentAdjustmentService) {}

  @Post()
  create(@Body() createDocumentAdjustmentDto: CreateDocumentAdjustmentDto) {
    return this.documentAdjustmentService.create(createDocumentAdjustmentDto);
  }

  @Get()
  findAll() {
    return this.documentAdjustmentService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.documentAdjustmentService.findOne(id);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() updateStatusDto: UpdateDocumentStatusDto) {
    return this.documentAdjustmentService.updateStatus(id, updateStatusDto.status);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateDto: CreateDocumentAdjustmentDto) {
    return this.documentAdjustmentService.update(id, updateDto);
  }

  @Post(':id/items')
  addItems(@Param('id') id: string, @Body() dto: CreateDocumentAdjustmentItemsDto) {
    return this.documentAdjustmentService.addItems(id, dto.items);
  }

  @Patch(':id/items/:itemId')
  updateItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: CreateDocumentAdjustmentItemDto,
  ) {
    return this.documentAdjustmentService.updateItem(id, itemId, dto);
  }

  @Delete(':id/items')
  removeItems(@Param('id') id: string, @Body() dto: RemoveDocumentAdjustmentItemsDto) {
    return this.documentAdjustmentService.removeItems(id, dto.itemIds);
  }
}
