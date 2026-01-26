import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { DocumentReturnService } from './document-return.service';
import {
  CreateDocumentReturnDto,
  CreateDocumentReturnItemDto,
} from './dto/create-document-return.dto';
import { ApiTags } from '@nestjs/swagger';
import { UpdateDocumentStatusDto } from '../document-purchase/dto/update-document-status.dto';

@ApiTags('document-returns')
@Controller('document-returns')
export class DocumentReturnController {
  constructor(private readonly documentReturnService: DocumentReturnService) {}

  @Post()
  create(@Body() createDocumentReturnDto: CreateDocumentReturnDto) {
    return this.documentReturnService.create(createDocumentReturnDto);
  }

  @Get()
  findAll() {
    return this.documentReturnService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.documentReturnService.findOne(id);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() updateStatusDto: UpdateDocumentStatusDto) {
    return this.documentReturnService.updateStatus(id, updateStatusDto.status);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateDto: CreateDocumentReturnDto) {
    return this.documentReturnService.update(id, updateDto);
  }

  @Post(':id/items')
  addItem(@Param('id') id: string, @Body() dto: CreateDocumentReturnItemDto) {
    return this.documentReturnService.addItem(id, dto);
  }

  @Patch(':id/items/:itemId')
  updateItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: CreateDocumentReturnItemDto,
  ) {
    return this.documentReturnService.updateItem(id, itemId, dto);
  }

  @Delete(':id/items/:itemId')
  removeItem(@Param('id') id: string, @Param('itemId') itemId: string) {
    return this.documentReturnService.removeItem(id, itemId);
  }
}
