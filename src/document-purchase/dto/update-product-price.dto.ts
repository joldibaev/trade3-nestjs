import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const UpdateProductPriceSchema = z.object({
  priceTypeId: z.uuid(),
  value: z.number(),
});

export class UpdateProductPriceDto extends createZodDto(UpdateProductPriceSchema) {}
