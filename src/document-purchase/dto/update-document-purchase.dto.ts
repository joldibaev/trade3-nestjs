import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { DocumentStatus } from '../../generated/prisma/enums';
import { UpdateProductPriceDto } from './create-document-purchase.dto';

export class UpdateDocumentPurchaseItemDto {
  @ApiProperty({ example: 'uuid-product-id' })
  @IsString()
  productId: string;

  @ApiProperty({ example: 100 })
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  quantity: number;

  @ApiProperty({ example: 12000, description: 'Cost price per unit' })
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  price: number;

  @ApiProperty({
    description: 'Update sales prices for this product (can be empty array)',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        priceTypeId: { type: 'string' },
        value: { type: 'number' },
      },
    },
    required: false,
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateProductPriceDto) // This will fail if not imported
  @IsOptional()
  newPrices?: UpdateProductPriceDto[];
}

export class UpdateDocumentPurchaseDto {
  @ApiProperty({ example: 'uuid-store-id' })
  @IsString()
  storeId: string;

  @ApiProperty({ example: 'uuid-vendor-id' })
  @IsString()
  vendorId: string;

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

  @ApiProperty({ example: 'Some notes about the purchase', required: false })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiProperty({ type: [UpdateDocumentPurchaseItemDto], required: false })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateDocumentPurchaseItemDto)
  @IsOptional()
  items?: UpdateDocumentPurchaseItemDto[];
}
