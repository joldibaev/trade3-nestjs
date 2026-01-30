import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const CreateDocumentReturnItemSchema = z.object({
  productId: z.uuid(),
  quantity: z.coerce.number().positive(),
  price: z.coerce.number().min(0).optional(),
});

export class CreateDocumentReturnItemDto extends createZodDto(CreateDocumentReturnItemSchema) {}
