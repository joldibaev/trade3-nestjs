import { Controller, Get, Post, Patch, Body, Param, Query } from '@nestjs/common';
import { DocumentSaleService } from './document-sale.service';
import { CreateDocumentSaleDto } from './dto/create-document-sale.dto';
import { ApiTags } from '@nestjs/swagger';
import {
  ApiStandardResponse,
  ApiStandardResponseArray,
  ApiIncludeQuery,
} from '../common/decorators/swagger-response.decorator';
import { DocumentSale } from '../generated/entities/documentsale.entity';
import { DocumentSaleRelations } from '../generated/relations/documentsale-relations.enum';
import { parseInclude } from '../common/utils/prisma-helpers';

@ApiTags('document-sales')
@Controller('document-sales')
export class DocumentSaleController {
  constructor(private readonly documentSaleService: DocumentSaleService) {}

  @Post()
  @ApiStandardResponse(DocumentSale)
  create(@Body() createDocumentSaleDto: CreateDocumentSaleDto) {
    return this.documentSaleService.create(createDocumentSaleDto);
  }

  @Get()
  @ApiIncludeQuery(DocumentSaleRelations)
  @ApiStandardResponseArray(DocumentSale)
  findAll(@Query('include') include?: string | string[]) {
    return this.documentSaleService.findAll(parseInclude(include));
  }

  @Get(':id')
  @ApiIncludeQuery(DocumentSaleRelations)
  @ApiStandardResponse(DocumentSale)
  findOne(@Param('id') id: string, @Query('include') include?: string | string[]) {
    return this.documentSaleService.findOne(id, parseInclude(include));
  }

  @Patch(':id/complete')
  @ApiStandardResponse(DocumentSale)
  complete(@Param('id') id: string) {
    return this.documentSaleService.complete(id);
  }
}
