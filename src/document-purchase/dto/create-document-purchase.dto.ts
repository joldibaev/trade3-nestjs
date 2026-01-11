import {
  IsArray,
  IsDateString,
  IsNumber,
  IsPositive,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateProductPriceDto {
  @ApiProperty({ example: 'uuid-pricetype-id' })
  @IsString()
  priceTypeId: string;

  @ApiProperty({ example: 15000 })
  @IsNumber()
  value: number;
}

export class CreateDocumentPurchaseItemDto {
  @ApiProperty({ example: 'uuid-product-id' })
  @IsString()
  productId: string;

  @ApiProperty({ example: 100 })
  @IsNumber()
  @IsPositive()
  quantity: number;

  @ApiProperty({ example: 12000, description: 'Cost price per unit' })
  @IsNumber()
  @Min(0)
  price: number; // Cost price is mandatory for Purchase

  @ApiProperty({
    description: 'Optional: Update sales prices for this product',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        priceTypeId: { type: 'string' },
        value: { type: 'number' },
      },
    },
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateProductPriceDto)
  newPrices: UpdateProductPriceDto[];
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

  @ApiProperty({ type: [CreateDocumentPurchaseItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateDocumentPurchaseItemDto)
  items: CreateDocumentPurchaseItemDto[];
}
