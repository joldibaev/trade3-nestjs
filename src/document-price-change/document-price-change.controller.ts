import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { DocumentPriceChange } from '../generated/prisma/client';
import { DocumentPriceChangeService } from './document-price-change.service';
import { CreateDocumentPriceChangeDto } from './dto/create-document-price-change.dto';
import { UpdateDocumentPriceChangeDto } from './dto/update-document-price-change.dto';
import { UpdateDocumentPriceChangeStatusDto } from './dto/update-document-price-change-status.dto';
import { PriceChangeSummary } from './interfaces/price-change-summary.interface';

@ApiTags('document-price-changes')
@Controller('document-price-changes')
export class DocumentPriceChangeController {
  constructor(private readonly documentPriceChangeService: DocumentPriceChangeService) {}

  @Post()
  create(@Body() createDto: CreateDocumentPriceChangeDto): Promise<DocumentPriceChange> {
    return this.documentPriceChangeService.create(createDto);
  }

  @Get('summary')
  getSummary(): Promise<PriceChangeSummary> {
    return this.documentPriceChangeService.getSummary();
  }

  @Get()
  findAll(): Promise<DocumentPriceChange[]> {
    return this.documentPriceChangeService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<DocumentPriceChange> {
    return this.documentPriceChangeService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateDto: UpdateDocumentPriceChangeDto,
  ): Promise<DocumentPriceChange> {
    return this.documentPriceChangeService.update(id, updateDto);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() body: UpdateDocumentPriceChangeStatusDto,
  ): Promise<DocumentPriceChange> {
    return this.documentPriceChangeService.updateStatus(id, body.status);
  }
}
