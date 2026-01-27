import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { DocumentStatus } from '../../generated/prisma/enums';

export const CreateDocumentAdjustmentSchema = z.object({
  storeId: z.uuid(),
  date: z.iso.datetime().optional(),
  status: z.enum(DocumentStatus).optional().default(DocumentStatus.DRAFT),
  notes: z.string().optional(),
});

export class CreateDocumentAdjustmentDto extends createZodDto(CreateDocumentAdjustmentSchema) {}
