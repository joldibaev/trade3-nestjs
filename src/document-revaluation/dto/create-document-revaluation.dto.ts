import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { DocumentStatus } from '../../generated/prisma/enums';
import { CreateDocumentRevaluationItemSchema } from './create-document-revaluation-item.dto';

export const CreateDocumentRevaluationSchema = z.object({
  date: z.iso.datetime(),
  status: z.enum(DocumentStatus).optional().default(DocumentStatus.DRAFT),
  notes: z.string().optional(),
  items: z.array(CreateDocumentRevaluationItemSchema),
});

export class CreateDocumentRevaluationDto extends createZodDto(CreateDocumentRevaluationSchema) {}
