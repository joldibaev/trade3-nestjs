import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { CreateDocumentPurchaseItemSchema } from './create-document-purchase-item.dto';

export const CreateDocumentPurchaseItemsSchema = z.object({
  items: z.array(CreateDocumentPurchaseItemSchema),
});

export const RemoveDocumentPurchaseItemsSchema = z.object({
  productIds: z.array(z.uuid()),
});

export class CreateDocumentPurchaseItemsDto extends createZodDto(
  CreateDocumentPurchaseItemsSchema,
) {}
export class RemoveDocumentPurchaseItemsDto extends createZodDto(
  RemoveDocumentPurchaseItemsSchema,
) {}
