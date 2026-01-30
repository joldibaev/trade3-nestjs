import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const RemoveDocumentAdjustmentItemsSchema = z.object({
  itemIds: z.array(z.uuid()),
});

export class RemoveDocumentAdjustmentItemsDto extends createZodDto(
  RemoveDocumentAdjustmentItemsSchema,
) {}
