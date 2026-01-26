import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  ValidateNested,
} from 'class-validator';
import { DocumentStatus } from '../../generated/prisma/enums';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CreateDocumentTransferItemDto {
  @ApiProperty({ example: 'uuid-product-id', required: false })
  @IsString()
  @IsOptional()
  productId?: string;

  @ApiProperty({ example: 5 })
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  quantity: number;
}

export class CreateDocumentTransferDto {
  @ApiProperty({ example: 'uuid-source-store-id' })
  @IsString()
  sourceStoreId: string;

  @ApiProperty({ example: 'uuid-destination-store-id' })
  @IsString()
  destinationStoreId: string;

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

  @ApiProperty({ example: 'Some notes about the transfer', required: false })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class CreateDocumentTransferItemsDto {
  @ApiProperty({
    description: 'List of items to add to the transfer',
    type: [CreateDocumentTransferItemDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateDocumentTransferItemDto)
  items: CreateDocumentTransferItemDto[];
}

export class RemoveDocumentTransferItemsDto {
  @ApiProperty({
    description: 'List of item IDs to remove from the transfer',
    example: ['uuid-item-id-1', 'uuid-item-id-2'],
  })
  @IsArray()
  @IsString({ each: true })
  itemIds: string[];
}
