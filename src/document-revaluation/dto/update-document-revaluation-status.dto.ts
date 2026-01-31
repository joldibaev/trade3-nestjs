import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { DocumentStatus } from '../../generated/prisma/enums';

export const UpdateDocumentRevaluationStatusSchema = z.object({
  status: z.enum(DocumentStatus),
});

export class UpdateDocumentRevaluationStatusDto extends createZodDto(
  UpdateDocumentRevaluationStatusSchema,
) {}
