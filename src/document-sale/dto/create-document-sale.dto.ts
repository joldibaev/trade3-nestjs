import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { DocumentStatus } from '../../generated/prisma/enums';

export const CreateDocumentSaleSchema = z.object({
  storeId: z.uuid(),
  cashboxId: z.uuid(),
  clientId: z.uuid().optional(),
  priceTypeId: z.uuid().optional(),
  date: z.string().optional(),
  status: z.enum(DocumentStatus).optional().default(DocumentStatus.DRAFT),
  notes: z.string().optional(),
});

export class CreateDocumentSaleDto extends createZodDto(CreateDocumentSaleSchema) {}
