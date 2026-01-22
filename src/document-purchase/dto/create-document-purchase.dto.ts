import {
  IsArray,
  IsDateString,
  IsNumber,
  IsPositive,
  IsString,
  Min,
  ValidateNested,
  IsOptional,
  IsEnum,
} from 'class-validator';
import { DocumentStatus } from '../../generated/prisma/enums';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CreateDocumentPurchaseItemDto {
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
  price: number; // Cost price is mandatory for Purchase

  @ApiProperty({ example: 15000, description: 'New retail price (optional)', required: false })
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  @IsOptional()
  newPrice?: number;
}

export class CreateDocumentPurchaseDto {
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

  @ApiProperty({ type: [CreateDocumentPurchaseItemDto], required: false })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateDocumentPurchaseItemDto)
  @IsOptional()
  items?: CreateDocumentPurchaseItemDto[];
}
