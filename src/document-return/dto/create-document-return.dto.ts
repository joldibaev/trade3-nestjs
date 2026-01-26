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
import { DocumentStatus } from '../../generated/prisma/enums';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CreateDocumentReturnItemDto {
  @ApiProperty({ example: 'uuid-product-id', required: false })
  @IsString()
  @IsOptional()
  productId?: string;

  @ApiProperty({ example: 5 })
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  quantity: number;

  @ApiProperty({ example: 15000, required: false })
  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  price?: number;
}

export class CreateDocumentReturnDto {
  @ApiProperty({ example: 'uuid-store-id' })
  @IsString()
  storeId: string;

  @ApiProperty({ example: 'uuid-client-id', required: false })
  @IsString()
  @IsOptional()
  clientId?: string;

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

  @ApiProperty({ example: 'Some notes about the return', required: false })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class CreateDocumentReturnItemsDto {
  @ApiProperty({
    description: 'List of items to add to the return',
    type: [CreateDocumentReturnItemDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateDocumentReturnItemDto)
  items: CreateDocumentReturnItemDto[];
}

export class RemoveDocumentReturnItemsDto {
  @ApiProperty({
    description: 'List of item IDs to remove from the return',
    example: ['uuid-item-id-1', 'uuid-item-id-2'],
  })
  @IsArray()
  @IsString({ each: true })
  itemIds: string[];
}
