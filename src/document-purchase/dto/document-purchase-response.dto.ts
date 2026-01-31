import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { CreateDocumentPurchaseSchema } from './create-document-purchase.dto';

// Define the response schema by picking/omitting from the base schema
// and adding fields that are present in the final entity (id, code, createdAt, etc.)
export const DocumentPurchaseResponseSchema = z
  .object({
    id: z.uuid(),
    code: z.string(),
    total: z.number().or(z.any()), // Prisma Decimal usually comes out as number or string depending on adapter
    createdAt: z.date().or(z.string()),
    updatedAt: z.date().or(z.string()),
  })
  .extend(CreateDocumentPurchaseSchema);

export class DocumentPurchaseResponseDto extends createZodDto(DocumentPurchaseResponseSchema) {}
