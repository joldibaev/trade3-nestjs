import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { CreateDocumentSaleItemSchema } from './create-document-sale-item.dto';

export const CreateDocumentSaleItemsSchema = z.object({
  items: z.array(CreateDocumentSaleItemSchema),
});

export class CreateDocumentSaleItemsDto extends createZodDto(CreateDocumentSaleItemsSchema) {}
