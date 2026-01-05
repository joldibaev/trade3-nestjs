import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { DocumentReturnService } from './document-return.service';
import { CreateDocumentReturnDto } from './dto/create-document-return.dto';
import { ApiTags } from '@nestjs/swagger';
import {
  ApiStandardResponse,
  ApiStandardResponseArray,
} from '../common/decorators/swagger-response.decorator';
import { DocumentReturn } from '../generated/entities/documentreturn.entity';

@ApiTags('document-returns')
@Controller('document-returns')
export class DocumentReturnController {
  constructor(private readonly documentReturnService: DocumentReturnService) {}

  @Post()
  @ApiStandardResponse(DocumentReturn)
  create(@Body() createDocumentReturnDto: CreateDocumentReturnDto) {
    return this.documentReturnService.create(createDocumentReturnDto);
  }

  @Get()
  @ApiStandardResponseArray(DocumentReturn)
  findAll() {
    // Basic include parsing or dedicated helper if needed
    // For now, simpler than Sale/Purchase as no ApiIncludeQuery requested yet?
    // But better reuse parseInclude if I import it.
    // I will skip ApiIncludeQuery for brevity unless requested.
    return this.documentReturnService.findAll();
  }

  @Get(':id')
  @ApiStandardResponse(DocumentReturn)
  findOne(@Param('id') id: string) {
    return this.documentReturnService.findOne(id);
  }
}
