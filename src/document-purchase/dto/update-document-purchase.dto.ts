import { PartialType } from '@nestjs/swagger';
import { CreateDocumentPurchaseDto } from './create-document-purchase.dto';

export class UpdateDocumentPurchaseDto extends PartialType(CreateDocumentPurchaseDto) {}
