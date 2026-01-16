import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
  IsPositive,
} from 'class-validator';
import { DocumentStatus } from '../../generated/prisma/enums';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

class CreateDocumentSaleItemDto {
  @ApiProperty({ example: 'uuid-product-id' })
  @IsString()
  productId: string;

  @ApiProperty({ example: 5 })
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  quantity: number;

  @ApiProperty({ example: 15000, required: false })
  @IsNumber()
  @IsPositive()
  @IsOptional()
  @Type(() => Number)
  price?: number;
}

export class CreateDocumentSaleDto {
  @ApiProperty({ example: 'uuid-store-id' })
  @IsString()
  storeId: string;

  @ApiProperty({ example: 'uuid-cashbox-id' })
  @IsString()
  cashboxId: string;

  @ApiProperty({ example: 'uuid-client-id', required: false })
  @IsString()
  @IsOptional()
  clientId?: string;

  @ApiProperty({ example: 'uuid-pricetype-id', required: false })
  @IsString()
  @IsOptional()
  priceTypeId?: string;

  @ApiProperty({ example: '2023-10-25T12:00:00Z', required: false })
  @IsDateString()
  @IsOptional()
  date?: string;

  @ApiProperty({
    enum: DocumentStatus,
    required: false,
    default: DocumentStatus.DRAFT,
  })
  @IsEnum(DocumentStatus)
  @IsOptional()
  status?: DocumentStatus;

  @ApiProperty({ type: [CreateDocumentSaleItemDto], required: false })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateDocumentSaleItemDto)
  @IsOptional()
  items?: CreateDocumentSaleItemDto[];
}
