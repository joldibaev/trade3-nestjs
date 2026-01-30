import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { CreateDocumentTransferItemSchema } from './create-document-transfer-item.dto';

export const CreateDocumentTransferItemsSchema = z.object({
  items: z.array(CreateDocumentTransferItemSchema),
});

export class CreateDocumentTransferItemsDto extends createZodDto(
  CreateDocumentTransferItemsSchema,
) {}
