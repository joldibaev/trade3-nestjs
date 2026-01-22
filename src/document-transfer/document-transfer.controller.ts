import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { DocumentTransferService } from './document-transfer.service';
import { CreateDocumentTransferDto } from './dto/create-document-transfer.dto';
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
}
