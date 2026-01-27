import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const CreateDocumentPriceChangeItemSchema = z.object({
  productId: z.uuid(),
  priceTypeId: z.uuid(),
  newValue: z.number(),
});

export class CreateDocumentPriceChangeItemDto extends createZodDto(
  CreateDocumentPriceChangeItemSchema,
) {}
