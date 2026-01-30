import { createZodDto } from 'nestjs-zod';

import { CreateDocumentReturnItemSchema } from './create-document-return-item.dto';

export const UpdateDocumentReturnItemSchema = CreateDocumentReturnItemSchema.partial();

export class UpdateDocumentReturnItemDto extends createZodDto(UpdateDocumentReturnItemSchema) {}
