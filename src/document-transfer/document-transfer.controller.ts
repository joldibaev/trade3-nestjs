import { Controller, Get, Post, Patch, Body, Param } from '@nestjs/common';
import { DocumentTransferService } from './document-transfer.service';
import { CreateDocumentTransferDto } from './dto/create-document-transfer.dto';
import { ApiTags } from '@nestjs/swagger';
import { UpdateDocumentStatusDto } from '../document-purchase/dto/update-document-status.dto';
import {
  ApiStandardResponse,
  ApiStandardResponseArray,
} from '../common/decorators/swagger-response.decorator';
import { DocumentTransfer } from '../generated/entities/document-transfer.entity';

@ApiTags('document-transfers')
@Controller('document-transfers')
export class DocumentTransferController {
  constructor(private readonly documentTransferService: DocumentTransferService) {}

  @Post()
  @ApiStandardResponse(DocumentTransfer)
  create(@Body() createDocumentTransferDto: CreateDocumentTransferDto) {
    return this.documentTransferService.create(createDocumentTransferDto);
  }

  @Get()
  @ApiStandardResponseArray(DocumentTransfer)
  findAll() {
    return this.documentTransferService.findAll();
  }

  @Get(':id')
  @ApiStandardResponse(DocumentTransfer)
  findOne(@Param('id') id: string) {
    return this.documentTransferService.findOne(id);
  }

  @Patch(':id/status')
  @ApiStandardResponse(DocumentTransfer)
  updateStatus(@Param('id') id: string, @Body() updateStatusDto: UpdateDocumentStatusDto) {
    return this.documentTransferService.updateStatus(id, updateStatusDto.status);
  }
}
