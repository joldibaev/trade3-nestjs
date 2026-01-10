import { IsEnum, IsNotEmpty } from 'class-validator';
import { DocumentStatus } from '../../generated/prisma/enums';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateDocumentStatusDto {
    @ApiProperty({ enum: DocumentStatus })
    @IsEnum(DocumentStatus)
    @IsNotEmpty()
    status: DocumentStatus;
}
