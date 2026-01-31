import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const CreateDocumentRevaluationItemSchema = z.object({
  productId: z.uuid(),
  priceTypeId: z.uuid(),
  newValue: z.number(),
});

export class CreateDocumentRevaluationItemDto extends createZodDto(
  CreateDocumentRevaluationItemSchema,
) {}
