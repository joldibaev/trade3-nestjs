import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const RemoveDocumentTransferItemsSchema = z.object({
  itemIds: z.array(z.uuid()),
});

export class RemoveDocumentTransferItemsDto extends createZodDto(
  RemoveDocumentTransferItemsSchema,
) {}
