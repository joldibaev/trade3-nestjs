import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const RemoveDocumentSaleItemsSchema = z.object({
  itemIds: z.array(z.uuid()),
});

export class RemoveDocumentSaleItemsDto extends createZodDto(RemoveDocumentSaleItemsSchema) {}
