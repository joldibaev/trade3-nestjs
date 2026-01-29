import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import type { AuthUser } from '../auth/interfaces/auth.interface';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { DocumentSummary } from '../common/interfaces/summary.interface';
import { DocumentPurchase } from '../generated/prisma/client';
import { DocumentPurchaseService } from './document-purchase.service';
import { CreateDocumentPurchaseDto } from './dto/create-document-purchase.dto';
import {
  CreateDocumentPurchaseItemsDto,
  RemoveDocumentPurchaseItemsDto,
} from './dto/document-purchase-bulk.dto';
import { UpdateDocumentPurchaseDto } from './dto/update-document-purchase.dto';
import { UpdateDocumentPurchaseItemDto } from './dto/update-document-purchase-item.dto';
import { UpdateDocumentStatusDto } from './dto/update-document-status.dto';

@ApiTags('document-purchases')
@Controller('document-purchases')
export class DocumentPurchaseController {
  constructor(private readonly documentPurchaseService: DocumentPurchaseService) {}

  @Post()
  create(
    @Body() createDocumentPurchaseDto: CreateDocumentPurchaseDto,
    @CurrentUser() user: AuthUser,
  ): Promise<DocumentPurchase> {
    return this.documentPurchaseService.create(createDocumentPurchaseDto, user?.id);
  }

  @Get('summary')
  getSummary(): Promise<DocumentSummary> {
    return this.documentPurchaseService.getSummary();
  }

  @Get()
  findAll(): Promise<DocumentPurchase[]> {
    return this.documentPurchaseService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<DocumentPurchase> {
    return this.documentPurchaseService.findOne(id);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() updateDocumentStatusDto: UpdateDocumentStatusDto,
    @CurrentUser() user: AuthUser,
  ): Promise<DocumentPurchase> {
    return this.documentPurchaseService.updateStatus(id, updateDocumentStatusDto.status, user?.id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateDto: UpdateDocumentPurchaseDto,
  ): Promise<DocumentPurchase> {
    return this.documentPurchaseService.update(id, updateDto);
  }

  @Post(':id/items')
  addItems(
    @Param('id') id: string,
    @Body() dto: CreateDocumentPurchaseItemsDto,
    @CurrentUser() user: AuthUser,
  ): Promise<DocumentPurchase> {
    return this.documentPurchaseService.addItems(id, dto.items, user?.id);
  }

  @Patch(':id/items/:itemId')
  updateItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() item: UpdateDocumentPurchaseItemDto,
    @CurrentUser() user: AuthUser,
  ): Promise<DocumentPurchase> {
    return this.documentPurchaseService.updateItem(id, itemId, item, user?.id);
  }

  @Delete(':id/items')
  removeItems(
    @Param('id') id: string,
    @Body() dto: RemoveDocumentPurchaseItemsDto,
    @CurrentUser() user: AuthUser,
  ): Promise<DocumentPurchase> {
    return this.documentPurchaseService.removeItems(id, dto.productIds, user?.id);
  }
}
