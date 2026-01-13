import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { DocumentPurchaseService } from './document-purchase.service';
import { CreateDocumentPurchaseDto } from './dto/create-document-purchase.dto';
import { UpdateDocumentStatusDto } from './dto/update-document-status.dto';
import { UpdateDocumentPurchaseDto } from './dto/update-document-purchase.dto';
import { ApiTags } from '@nestjs/swagger';
import {
  ApiStandardResponse,
  ApiStandardResponseArray,
  ApiIncludeQuery,
} from '../common/decorators/swagger-response.decorator';
import { parseInclude } from '../common/utils/prisma-helpers';
import { DocumentPurchase } from '../generated/entities/document-purchase.entity';
import { DocumentPurchaseRelations } from '../generated/relations/document-purchase-relations.enum';

@ApiTags('document-purchases')
@Controller('document-purchases')
export class DocumentPurchaseController {
  constructor(private readonly documentPurchaseService: DocumentPurchaseService) {}

  @Post()
  @ApiStandardResponse(DocumentPurchase)
  create(@Body() createDocumentPurchaseDto: CreateDocumentPurchaseDto) {
    return this.documentPurchaseService.create(createDocumentPurchaseDto);
  }

  @Get()
  @ApiIncludeQuery(DocumentPurchaseRelations)
  @ApiStandardResponseArray(DocumentPurchase)
  findAll(@Query('include') include?: string | string[]) {
    return this.documentPurchaseService.findAll(parseInclude(include));
  }

  @Get(':id')
  @ApiIncludeQuery(DocumentPurchaseRelations)
  @ApiStandardResponse(DocumentPurchase)
  findOne(@Param('id') id: string, @Query('include') include?: string | string[]) {
    return this.documentPurchaseService.findOne(id, parseInclude(include));
  }

  @Patch(':id/status')
  @ApiStandardResponse(DocumentPurchase)
  updateStatus(@Param('id') id: string, @Body() updateDocumentStatusDto: UpdateDocumentStatusDto) {
    return this.documentPurchaseService.updateStatus(id, updateDocumentStatusDto.status);
  }

  @Patch(':id')
  @ApiStandardResponse(DocumentPurchase)
  update(@Param('id') id: string, @Body() updateDto: UpdateDocumentPurchaseDto) {
    return this.documentPurchaseService.update(id, updateDto);
  }

  @Delete(':id')
  @ApiStandardResponse(DocumentPurchase)
  remove(@Param('id') id: string) {
    return this.documentPurchaseService.remove(id);
  }
}
