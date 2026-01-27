import { createZodDto } from 'nestjs-zod';
import { CreateBarcodeSchema } from './create-barcode.dto';

export class UpdateBarcodeDto extends createZodDto(CreateBarcodeSchema.partial()) {}
