import { Controller, Get, Post, Patch, Body, Param } from '@nestjs/common';
import { DocumentReturnService } from './document-return.service';
import { CreateDocumentReturnDto } from './dto/create-document-return.dto';
import { ApiTags } from '@nestjs/swagger';
import { UpdateDocumentStatusDto } from '../document-purchase/dto/update-document-status.dto';
import {
  ApiStandardResponse,
  ApiStandardResponseArray,
} from '../common/decorators/swagger-response.decorator';
import { DocumentReturn } from '../generated/entities/document-return.entity';

@ApiTags('document-returns')
@Controller('document-returns')
export class DocumentReturnController {
  constructor(private readonly documentReturnService: DocumentReturnService) { }

  @Post()
  @ApiStandardResponse(DocumentReturn)
  create(@Body() createDocumentReturnDto: CreateDocumentReturnDto) {
    return this.documentReturnService.create(createDocumentReturnDto);
  }

  @Get()
  @ApiStandardResponseArray(DocumentReturn)
  findAll() {
    return this.documentReturnService.findAll();
  }

  @Get(':id')
  @ApiStandardResponse(DocumentReturn)
  findOne(@Param('id') id: string) {
    return this.documentReturnService.findOne(id);
  }

  @Patch(':id/status')
  @ApiStandardResponse(DocumentReturn)
  updateStatus(@Param('id') id: string, @Body() updateStatusDto: UpdateDocumentStatusDto) {
    return this.documentReturnService.updateStatus(id, updateStatusDto.status);
  }
}
