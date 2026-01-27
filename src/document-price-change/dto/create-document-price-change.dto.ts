import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { DocumentStatus } from '../../generated/prisma/enums';
import { CreateDocumentPriceChangeItemSchema } from './create-document-price-change-item.dto';

export const CreateDocumentPriceChangeSchema = z.object({
  date: z.iso.datetime(),
  status: z.enum(DocumentStatus).optional().default(DocumentStatus.DRAFT),
  notes: z.string().optional(),
  items: z.array(CreateDocumentPriceChangeItemSchema),
});

export class CreateDocumentPriceChangeDto extends createZodDto(CreateDocumentPriceChangeSchema) {}
