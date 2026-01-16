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

class CreateDocumentAdjustmentItemDto {
  @ApiProperty({ example: 'uuid-product-id' })
  @IsString()
  productId: string;

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

  @ApiProperty({ type: [CreateDocumentAdjustmentItemDto], required: false })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateDocumentAdjustmentItemDto)
  @IsOptional()
  items?: CreateDocumentAdjustmentItemDto[];
}
