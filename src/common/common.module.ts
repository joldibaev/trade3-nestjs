import { Global, Module } from '@nestjs/common';

import { BaseDocumentService } from './base-document.service';

@Global()
@Module({
  providers: [BaseDocumentService],
  exports: [BaseDocumentService],
})
export class CommonModule {}
