import { Controller, Get, Post, Patch, Body, Param } from '@nestjs/common';
import { DocumentAdjustmentService } from './document-adjustment.service';
import { CreateDocumentAdjustmentDto } from './dto/create-document-adjustment.dto';
import { ApiTags } from '@nestjs/swagger';
import {
  ApiStandardResponse,
  ApiStandardResponseArray,
} from '../common/decorators/swagger-response.decorator';
import { DocumentAdjustment } from '../generated/entities/document-adjustment.entity';

@ApiTags('document-adjustments')
@Controller('document-adjustments')
export class DocumentAdjustmentController {
  constructor(private readonly documentAdjustmentService: DocumentAdjustmentService) {}

  @Post()
  @ApiStandardResponse(DocumentAdjustment)
  create(@Body() createDocumentAdjustmentDto: CreateDocumentAdjustmentDto) {
    return this.documentAdjustmentService.create(createDocumentAdjustmentDto);
  }

  @Get()
  @ApiStandardResponseArray(DocumentAdjustment)
  findAll() {
    return this.documentAdjustmentService.findAll();
  }

  @Get(':id')
  @ApiStandardResponse(DocumentAdjustment)
  findOne(@Param('id') id: string) {
    return this.documentAdjustmentService.findOne(id);
  }

  @Patch(':id/complete')
  @ApiStandardResponse(DocumentAdjustment)
  complete(@Param('id') id: string) {
    return this.documentAdjustmentService.complete(id);
  }
}
