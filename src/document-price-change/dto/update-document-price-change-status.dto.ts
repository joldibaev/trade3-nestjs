import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { DocumentStatus } from '../../generated/prisma/enums';

export const UpdateDocumentPriceChangeStatusSchema = z.object({
  status: z.enum(DocumentStatus),
});

export class UpdateDocumentPriceChangeStatusDto extends createZodDto(
  UpdateDocumentPriceChangeStatusSchema,
) {}
