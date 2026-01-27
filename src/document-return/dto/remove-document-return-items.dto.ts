import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const RemoveDocumentReturnItemsSchema = z.object({
  itemIds: z.array(z.uuid()),
});

export class RemoveDocumentReturnItemsDto extends createZodDto(RemoveDocumentReturnItemsSchema) {}
