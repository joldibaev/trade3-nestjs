import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { DocumentAdjustmentService } from './document-adjustment.service';
import { CreateDocumentAdjustmentDto } from './dto/create-document-adjustment.dto';
import { ApiTags } from '@nestjs/swagger';
import { UpdateDocumentStatusDto } from '../document-purchase/dto/update-document-status.dto';

@ApiTags('document-adjustments')
@Controller('document-adjustments')
export class DocumentAdjustmentController {
  constructor(private readonly documentAdjustmentService: DocumentAdjustmentService) {}

  @Post()
  create(@Body() createDocumentAdjustmentDto: CreateDocumentAdjustmentDto) {
    return this.documentAdjustmentService.create(createDocumentAdjustmentDto);
  }

  @Get()
  findAll() {
    return this.documentAdjustmentService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.documentAdjustmentService.findOne(id);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() updateStatusDto: UpdateDocumentStatusDto) {
    return this.documentAdjustmentService.updateStatus(id, updateStatusDto.status);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateDto: CreateDocumentAdjustmentDto) {
    return this.documentAdjustmentService.update(id, updateDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.documentAdjustmentService.remove(id);
  }
}
