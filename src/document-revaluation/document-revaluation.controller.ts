import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { DocumentRevaluation } from '../generated/prisma/client';
import { DocumentRevaluationService } from './document-revaluation.service';
import { CreateDocumentRevaluationDto } from './dto/create-document-revaluation.dto';
import { UpdateDocumentRevaluationDto } from './dto/update-document-revaluation.dto';
import { UpdateDocumentRevaluationStatusDto } from './dto/update-document-revaluation-status.dto';

@ApiTags('document-revaluations')
@Controller('document-revaluations')
export class DocumentRevaluationController {
  constructor(private readonly documentRevaluationService: DocumentRevaluationService) {}

  @Post()
  create(@Body() createDto: CreateDocumentRevaluationDto): Promise<DocumentRevaluation> {
    return this.documentRevaluationService.create(createDto);
  }

  @Get()
  findAll(): Promise<DocumentRevaluation[]> {
    return this.documentRevaluationService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<DocumentRevaluation> {
    return this.documentRevaluationService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateDto: UpdateDocumentRevaluationDto,
  ): Promise<DocumentRevaluation> {
    return this.documentRevaluationService.update(id, updateDto);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() body: UpdateDocumentRevaluationStatusDto,
  ): Promise<DocumentRevaluation> {
    return this.documentRevaluationService.updateStatus(id, body.status);
  }
}
