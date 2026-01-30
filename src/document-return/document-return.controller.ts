import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { UpdateDocumentStatusDto } from '../document-purchase/dto/update-document-status.dto';
import { DocumentReturn } from '../generated/prisma/client';
import { DocumentReturnService } from './document-return.service';
import { CreateDocumentReturnDto } from './dto/create-document-return.dto';
import { CreateDocumentReturnItemsDto } from './dto/create-document-return-items.dto';
import { RemoveDocumentReturnItemsDto } from './dto/remove-document-return-items.dto';
import { UpdateDocumentReturnItemDto } from './dto/update-document-return-item.dto';

@ApiTags('document-returns')
@Controller('document-returns')
export class DocumentReturnController {
  constructor(private readonly documentReturnService: DocumentReturnService) {}

  @Post()
  create(@Body() createDocumentReturnDto: CreateDocumentReturnDto): Promise<DocumentReturn> {
    return this.documentReturnService.create(createDocumentReturnDto);
  }

  @Get()
  findAll(): Promise<DocumentReturn[]> {
    return this.documentReturnService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<DocumentReturn> {
    return this.documentReturnService.findOne(id);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() updateStatusDto: UpdateDocumentStatusDto,
  ): Promise<DocumentReturn> {
    return this.documentReturnService.updateStatus(id, updateStatusDto.status);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateDto: CreateDocumentReturnDto,
  ): Promise<DocumentReturn> {
    return this.documentReturnService.update(id, updateDto);
  }

  @Post(':id/items')
  addItems(
    @Param('id') id: string,
    @Body() dto: CreateDocumentReturnItemsDto,
  ): Promise<DocumentReturn> {
    return this.documentReturnService.addItems(id, dto.items);
  }

  @Patch(':id/items/:itemId')
  updateItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateDocumentReturnItemDto,
  ): Promise<DocumentReturn> {
    return this.documentReturnService.updateItem(id, itemId, dto);
  }

  @Delete(':id/items')
  removeItems(
    @Param('id') id: string,
    @Body() dto: RemoveDocumentReturnItemsDto,
  ): Promise<DocumentReturn> {
    return this.documentReturnService.removeItems(id, dto.itemIds);
  }
}
