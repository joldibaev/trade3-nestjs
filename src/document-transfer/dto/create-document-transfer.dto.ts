import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { DocumentStatus } from '../../generated/prisma/enums';

export const CreateDocumentTransferSchema = z.object({
  sourceStoreId: z.uuid(),
  destinationStoreId: z.uuid(),
  date: z.iso.datetime().optional(),
  status: z.enum(DocumentStatus).optional().default(DocumentStatus.DRAFT),
  notes: z.string().optional(),
});

export class CreateDocumentTransferDto extends createZodDto(CreateDocumentTransferSchema) {}
