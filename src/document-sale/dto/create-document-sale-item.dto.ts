import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const CreateDocumentSaleItemSchema = z.object({
  productId: z.uuid(),
  quantity: z.coerce.number().positive(),
  price: z.coerce.number().positive().optional(),
});

export class CreateDocumentSaleItemDto extends createZodDto(CreateDocumentSaleItemSchema) {}
