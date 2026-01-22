import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DocumentStatus } from '../../generated/prisma/enums';
import { ApiProperty } from '@nestjs/swagger';

export class CreateDocumentPriceChangeItemDto {
  @ApiProperty({ example: 'uuid-product-id' })
  @IsString()
  productId: string;

  @ApiProperty({ example: 'uuid-price-type-id' })
  @IsString()
  priceTypeId: string;

  @ApiProperty({ example: 100 })
  @IsNumber()
  @Type(() => Number)
  newValue: number;
}

export class CreateDocumentPriceChangeDto {
  @ApiProperty({ example: '2023-10-25T12:00:00Z' })
  @IsDateString()
  date: string;

  @ApiProperty({
    enum: DocumentStatus,
    required: false,
    default: DocumentStatus.DRAFT,
  })
  @IsEnum(DocumentStatus)
  @IsOptional()
  status?: DocumentStatus;

  @ApiProperty({ example: 'Seasonal price update', required: false })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiProperty({ type: [CreateDocumentPriceChangeItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateDocumentPriceChangeItemDto)
  items: CreateDocumentPriceChangeItemDto[];
}
