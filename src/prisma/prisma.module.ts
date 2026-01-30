import { Global, Module } from '@nestjs/common';

import { PrismaService } from './prisma.service';
import { PrismaIndexerService } from './prisma-indexer.service';

@Global()
@Module({
  providers: [PrismaService, PrismaIndexerService],
  exports: [PrismaService],
})
export class PrismaModule {}
