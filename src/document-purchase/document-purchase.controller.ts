import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { DocumentPurchaseService } from './document-purchase.service';
import { CreateDocumentPurchaseDto } from './dto/create-document-purchase.dto';
import {
  CreateDocumentPurchaseItemsDto,
  RemoveDocumentPurchaseItemsDto,
} from './dto/document-purchase-bulk.dto';
import { UpdateDocumentPurchaseItemDto } from './dto/update-document-purchase-item.dto';
import { UpdateDocumentPurchaseDto } from './dto/update-document-purchase.dto';
import { UpdateDocumentStatusDto } from './dto/update-document-status.dto';
import { ApiTags } from '@nestjs/swagger';

interface AuthenticatedRequest extends FastifyRequest {
  user?: {
    id: string;
  };
}

@ApiTags('document-purchases')
@Controller('document-purchases')
export class DocumentPurchaseController {
  constructor(private readonly documentPurchaseService: DocumentPurchaseService) {}

  @Post()
  create(
    @Body() createDocumentPurchaseDto: CreateDocumentPurchaseDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.documentPurchaseService.create(createDocumentPurchaseDto, req.user?.id);
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
  updateStatus(
    @Param('id') id: string,
    @Body() updateDocumentStatusDto: UpdateDocumentStatusDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.documentPurchaseService.updateStatus(
      id,
      updateDocumentStatusDto.status,
      req.user?.id,
    );
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateDto: UpdateDocumentPurchaseDto) {
    return this.documentPurchaseService.update(id, updateDto);
  }

  @Post(':id/items')
  addItems(
    @Param('id') id: string,
    @Body() dto: CreateDocumentPurchaseItemsDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.documentPurchaseService.addItems(id, dto.items, req.user?.id);
  }

  @Patch(':id/items/:itemId')
  updateItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() item: UpdateDocumentPurchaseItemDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.documentPurchaseService.updateItem(id, itemId, item, req.user?.id);
  }

  @Delete(':id/items')
  removeItems(
    @Param('id') id: string,
    @Body() dto: RemoveDocumentPurchaseItemsDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.documentPurchaseService.removeItems(id, dto.productIds, req.user?.id);
  }
}
