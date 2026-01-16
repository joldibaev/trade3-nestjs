import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { DocumentPurchaseService } from './document-purchase.service';
import { CreateDocumentPurchaseDto } from './dto/create-document-purchase.dto';
import { UpdateDocumentStatusDto } from './dto/update-document-status.dto';
import { UpdateDocumentPurchaseDto } from './dto/update-document-purchase.dto';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('document-purchases')
@Controller('document-purchases')
export class DocumentPurchaseController {
  constructor(private readonly documentPurchaseService: DocumentPurchaseService) {}

  @Post()
  create(@Body() createDocumentPurchaseDto: CreateDocumentPurchaseDto) {
    return this.documentPurchaseService.create(createDocumentPurchaseDto);
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

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.documentPurchaseService.remove(id);
  }
}
