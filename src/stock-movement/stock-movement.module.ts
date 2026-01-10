import { Module, Global } from '@nestjs/common';
import { StockMovementService } from './stock-movement.service';
import { StockMovementController } from './stock-movement.controller';
import { PrismaModule } from '../core/prisma/prisma.module';

@Global()
@Module({
  imports: [PrismaModule],
  controllers: [StockMovementController],
  providers: [StockMovementService],
  exports: [StockMovementService],
})
export class StockMovementModule {}
