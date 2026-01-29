import { createZodDto } from 'nestjs-zod';

import { CreateDocumentSaleItemSchema } from './create-document-sale-item.dto';

export const UpdateDocumentSaleItemSchema = CreateDocumentSaleItemSchema.partial();

export class UpdateDocumentSaleItemDto extends createZodDto(UpdateDocumentSaleItemSchema) {}
