import { PartialType } from '@nestjs/swagger';

import { CreateDocumentPriceChangeDto } from './create-document-price-change.dto';

export class UpdateDocumentPriceChangeDto extends PartialType(CreateDocumentPriceChangeDto) {}
