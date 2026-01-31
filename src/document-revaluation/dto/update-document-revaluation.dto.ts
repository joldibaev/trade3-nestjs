import { PartialType } from '@nestjs/swagger';

import { CreateDocumentRevaluationDto } from './create-document-revaluation.dto';

export class UpdateDocumentRevaluationDto extends PartialType(CreateDocumentRevaluationDto) {}
