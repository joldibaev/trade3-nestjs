import { BadRequestException, Injectable } from '@nestjs/common';

import { DocumentStatus } from '../generated/prisma/enums';

@Injectable()
export class BaseDocumentService {
  /**
   * Ensures the document is in DRAFT status before allowing modifications.
   */
  ensureDraft(status: DocumentStatus): void {
    if (status !== 'DRAFT') {
      throw new BadRequestException('Только черновики могут быть изменены');
    }
  }
}
