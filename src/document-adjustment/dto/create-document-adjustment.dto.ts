import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { DocumentStatus } from '../../generated/prisma/enums';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CreateDocumentAdjustmentItemDto {
  @ApiProperty({ example: 'uuid-product-id', required: false })
  @IsString()
  @IsOptional()
  productId?: string;

  @ApiProperty({
    example: 5,
    description: 'Positive to add, negative to remove',
  })
  @IsNumber()
  @Type(() => Number)
  quantity: number;
}

export class CreateDocumentAdjustmentDto {
  @ApiProperty({ example: 'uuid-store-id' })
  @IsString()
  storeId: string;

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

  @ApiProperty({ example: 'Some notes about the adjustment', required: false })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class CreateDocumentAdjustmentItemsDto {
  @ApiProperty({
    description: 'List of items to add to the adjustment',
    type: [CreateDocumentAdjustmentItemDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateDocumentAdjustmentItemDto)
  items: CreateDocumentAdjustmentItemDto[];
}

export class RemoveDocumentAdjustmentItemsDto {
  @ApiProperty({
    description: 'List of item IDs to remove from the adjustment',
    example: ['uuid-item-id-1', 'uuid-item-id-2'],
  })
  @IsArray()
  @IsString({ each: true })
  itemIds: string[];
}
