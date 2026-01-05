import { Controller, Get, Post, Patch, Body, Param, Query } from '@nestjs/common';
import { DocumentPurchaseService } from './document-purchase.service';
import { CreateDocumentPurchaseDto } from './dto/create-document-purchase.dto';
import { ApiTags } from '@nestjs/swagger';
import {
  ApiStandardResponse,
  ApiStandardResponseArray,
  ApiIncludeQuery,
} from '../common/decorators/swagger-response.decorator';
import { DocumentPurchase } from '../generated/entities/documentpurchase.entity';
import { DocumentPurchaseRelations } from '../generated/relations/documentpurchase-relations.enum';
import { parseInclude } from '../common/utils/prisma-helpers';

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

  @Patch(':id/complete')
  @ApiStandardResponse(DocumentPurchase)
  complete(@Param('id') id: string) {
    return this.documentPurchaseService.complete(id);
  }
}
