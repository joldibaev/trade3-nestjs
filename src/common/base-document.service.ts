import { BadRequestException, Injectable } from '@nestjs/common';
import { DocumentStatus } from '../generated/prisma/enums';

@Injectable()
export class BaseDocumentService {
  /**
   * Validates that the document date is not in the future.
   */
  validateDate(date: string | Date) {
    const docDate = new Date(date);
    const now = new Date();

    // Reset hours for a "date-only" comparison if needed,
    // but usually "future" means any time after "now".
    if (docDate > now) {
      throw new BadRequestException('Дата документа не может быть в будущем');
    }
    return docDate;
  }

  /**
   * Ensures the document is in DRAFT status before allowing modifications.
   */
  ensureDraft(status: DocumentStatus) {
    if (status !== 'DRAFT') {
      throw new BadRequestException('Только черновики могут быть изменены');
    }
  }
}
