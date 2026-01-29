import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { CreateDocumentReturnItemSchema } from './create-document-return-item.dto';

export const CreateDocumentReturnItemsSchema = z.object({
  items: z.array(CreateDocumentReturnItemSchema),
});

export class CreateDocumentReturnItemsDto extends createZodDto(CreateDocumentReturnItemsSchema) {}
