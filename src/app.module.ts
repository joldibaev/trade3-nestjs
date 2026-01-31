import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';

import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { BarcodeModule } from './barcode/barcode.module';
import { CashboxModule } from './cashbox/cashbox.module';
import { CategoryModule } from './category/category.module';
import { ClientModule } from './client/client.module';
import { CodeGeneratorModule } from './code-generator/code-generator.module';
import { CommonModule } from './common/common.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { HealthController } from './common/health.controller';
import { DocumentAdjustmentModule } from './document-adjustment/document-adjustment.module';
import { DocumentHistoryModule } from './document-history/document-history.module';
import { DocumentPurchaseModule } from './document-purchase/document-purchase.module';
import { DocumentReturnModule } from './document-return/document-return.module';
import { DocumentRevaluationModule } from './document-revaluation/document-revaluation.module';
import { DocumentSaleModule } from './document-sale/document-sale.module';
import { DocumentTransferModule } from './document-transfer/document-transfer.module';
import { InventoryModule } from './inventory/inventory.module';
import { PriceModule } from './price/price.module';
import { PriceLedgerModule } from './price-ledger/price-ledger.module';
import { PriceTypeModule } from './pricetype/pricetype.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProductModule } from './product/product.module';
import { SchedulerCoreModule } from './scheduler/scheduler.module';
import { StatisticsModule } from './statistics/statistics.module';
import { StockLedgerModule } from './stock-ledger/stock-ledger.module';
import { StoreModule } from './store/store.module';
import { UsersModule } from './users/users.module';
import { VendorModule } from './vendor/vendor.module';

@Module({
  imports: [
    PrismaModule,
    PrometheusModule.register(),
    ConfigModule.forRoot({ isGlobal: true }),

    StoreModule,
    CashboxModule,
    CategoryModule,
    ProductModule,
    VendorModule,
    ClientModule,
    PriceTypeModule,
    DocumentSaleModule,
    DocumentPurchaseModule,
    DocumentReturnModule,
    DocumentAdjustmentModule,
    DocumentTransferModule,
    BarcodeModule,
    PriceModule,
    InventoryModule,
    StockLedgerModule,
    PriceLedgerModule,
    DocumentRevaluationModule,
    DocumentHistoryModule,
    CommonModule,
    SchedulerCoreModule,
    CodeGeneratorModule,
    AuthModule,
    UsersModule,
    StatisticsModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
})
export class AppModule {}
