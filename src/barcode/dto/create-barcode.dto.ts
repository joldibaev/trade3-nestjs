import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class CreateBarcodeDto {
  @ApiProperty({
    description: 'The barcode value (e.g., EAN-13 string)',
    example: '4004675008235',
  })
  @IsNotEmpty()
  @IsString()
  value: string;

  @ApiProperty({
    description: 'The ID of the product this barcode belongs to',
    example: '018f3a3a-3a3a-7a3a-a3a3-a3a3a3a3a3a3',
  })
  @IsNotEmpty()
  @IsUUID(7)
  productId: string;
}
