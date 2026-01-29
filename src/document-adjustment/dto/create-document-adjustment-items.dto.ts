import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { CreateDocumentAdjustmentItemSchema } from './create-document-adjustment-item.dto';

export const CreateDocumentAdjustmentItemsSchema = z.object({
  items: z.array(CreateDocumentAdjustmentItemSchema),
});

export class CreateDocumentAdjustmentItemsDto extends createZodDto(
  CreateDocumentAdjustmentItemsSchema,
) {}
