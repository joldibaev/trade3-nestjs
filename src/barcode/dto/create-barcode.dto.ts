import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const CreateBarcodeSchema = z.object({
  value: z.string().min(1),
  productId: z.string().uuid(),
});

export class CreateBarcodeDto extends createZodDto(CreateBarcodeSchema) {}
