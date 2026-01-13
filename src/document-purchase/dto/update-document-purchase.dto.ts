import { ApiProperty } from '@nestjs/swagger';
import { IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import {
  CreateDocumentPurchaseDto,
  CreateDocumentPurchaseItemDto,
} from './create-document-purchase.dto';

export class UpdateDocumentPurchaseDto extends CreateDocumentPurchaseDto {
  @ApiProperty({ type: [CreateDocumentPurchaseItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateDocumentPurchaseItemDto)
  items: CreateDocumentPurchaseItemDto[];
}
