import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const CreateDocumentAdjustmentItemSchema = z.object({
  productId: z.uuid(),
  quantity: z.number(),
});

export class CreateDocumentAdjustmentItemDto extends createZodDto(
  CreateDocumentAdjustmentItemSchema,
) {}
