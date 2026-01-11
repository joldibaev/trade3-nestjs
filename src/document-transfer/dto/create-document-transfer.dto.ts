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

class CreateDocumentTransferItemDto {
  @ApiProperty({ example: 'uuid-product-id' })
  @IsString()
  productId: string;

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
    default: DocumentStatus.COMPLETED,
  })
  @IsEnum(DocumentStatus)
  @IsOptional()
  status?: DocumentStatus;

  @ApiProperty({ type: [CreateDocumentTransferItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateDocumentTransferItemDto)
  items: CreateDocumentTransferItemDto[];
}
