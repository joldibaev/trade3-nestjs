import { createZodDto } from 'nestjs-zod';
import { CreateDocumentPurchaseSchema } from './create-document-purchase.dto';

export class UpdateDocumentPurchaseDto extends createZodDto(
  CreateDocumentPurchaseSchema.partial(),
) {}
