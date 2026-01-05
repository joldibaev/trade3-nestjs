import { PartialType } from '@nestjs/swagger';
import { CreateBarcodeDto } from './create-barcode.dto';

export class UpdateBarcodeDto extends PartialType(CreateBarcodeDto) {}
