import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { UpdateProductPriceSchema } from './update-product-price.dto';

export const CreateDocumentPurchaseItemSchema = z.object({
  productId: z.uuid(),
  quantity: z.coerce.number().positive(),
  price: z.coerce.number().min(0),
  newPrices: z.array(UpdateProductPriceSchema).optional().default([]),
});

export class CreateDocumentPurchaseItemDto extends createZodDto(CreateDocumentPurchaseItemSchema) {}
