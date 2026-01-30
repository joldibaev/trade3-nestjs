import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { DocumentStatus } from '../../generated/prisma/enums';

export const CreateDocumentPurchaseSchema = z.object({
  storeId: z.uuid(),
  vendorId: z.uuid(),
  date: z.string(),
  status: z.enum(DocumentStatus).optional().default(DocumentStatus.DRAFT),
  notes: z.string().optional(),
});

export class CreateDocumentPurchaseDto extends createZodDto(CreateDocumentPurchaseSchema) {}
