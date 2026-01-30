import { createZodDto } from 'nestjs-zod';

import { CreateDocumentPurchaseItemSchema } from './create-document-purchase-item.dto';

export const UpdateDocumentPurchaseItemSchema = CreateDocumentPurchaseItemSchema.partial();

export class UpdateDocumentPurchaseItemDto extends createZodDto(UpdateDocumentPurchaseItemSchema) {}
