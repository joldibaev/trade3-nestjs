import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const CreateDocumentTransferItemSchema = z.object({
  productId: z.uuid(),
  quantity: z.number().positive(),
});

export class CreateDocumentTransferItemDto extends createZodDto(CreateDocumentTransferItemSchema) {}
