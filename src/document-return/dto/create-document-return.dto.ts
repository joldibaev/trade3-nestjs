import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { DocumentStatus } from '../../generated/prisma/enums';

export const CreateDocumentReturnSchema = z.object({
  storeId: z.uuid(),
  clientId: z.uuid().optional(),
  date: z.string().optional(),
  status: z.enum(DocumentStatus).optional().default(DocumentStatus.DRAFT),
  notes: z.string().optional(),
});

export class CreateDocumentReturnDto extends createZodDto(CreateDocumentReturnSchema) {}
