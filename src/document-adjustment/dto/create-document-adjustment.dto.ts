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
    default: DocumentStatus.COMPLETED,
  })
  @IsEnum(DocumentStatus)
  @IsOptional()
  status?: DocumentStatus;

  @ApiProperty({ type: [CreateDocumentAdjustmentItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateDocumentAdjustmentItemDto)
  items: CreateDocumentAdjustmentItemDto[];
}
