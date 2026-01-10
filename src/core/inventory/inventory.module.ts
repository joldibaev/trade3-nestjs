import { Module, Global } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { PrismaModule } from '../prisma/prisma.module';
import { StockMovementModule } from '../../stock-movement/stock-movement.module';

@Global()
@Module({
  imports: [PrismaModule, StockMovementModule],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
