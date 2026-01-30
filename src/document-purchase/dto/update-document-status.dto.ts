import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { DocumentStatus } from '../../generated/prisma/enums';

export const UpdateDocumentStatusSchema = z.object({
  status: z.enum(DocumentStatus),
});

export class UpdateDocumentStatusDto extends createZodDto(UpdateDocumentStatusSchema) {}
