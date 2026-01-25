import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';
import { DocumentStatus } from '../../generated/prisma/enums';

export class UpdateDocumentPriceChangeStatusDto {
  @ApiProperty({
    enum: DocumentStatus,
    description: 'Новый статус документа',
    example: DocumentStatus.COMPLETED,
  })
  @IsEnum(DocumentStatus)
  @IsNotEmpty()
  status: DocumentStatus;
}
