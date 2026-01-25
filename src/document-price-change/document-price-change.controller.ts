import { Controller, Get, Post, Body, Patch, Param } from '@nestjs/common';
import { DocumentPriceChangeService } from './document-price-change.service';
import { CreateDocumentPriceChangeDto } from './dto/create-document-price-change.dto';
import { UpdateDocumentPriceChangeDto } from './dto/update-document-price-change.dto';
import { ApiTags } from '@nestjs/swagger';
import { UpdateDocumentPriceChangeStatusDto } from './dto/update-document-price-change-status.dto';

@ApiTags('document-price-changes')
@Controller('document-price-changes')
export class DocumentPriceChangeController {
  constructor(private readonly documentPriceChangeService: DocumentPriceChangeService) {}

  @Post()
  create(@Body() createDto: CreateDocumentPriceChangeDto) {
    return this.documentPriceChangeService.create(createDto);
  }

  @Get()
  findAll() {
    return this.documentPriceChangeService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.documentPriceChangeService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateDto: UpdateDocumentPriceChangeDto) {
    return this.documentPriceChangeService.update(id, updateDto);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() body: UpdateDocumentPriceChangeStatusDto) {
    return this.documentPriceChangeService.updateStatus(id, body.status);
  }
}
