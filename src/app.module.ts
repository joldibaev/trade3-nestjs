import { Module } from '@nestjs/common';
import { PrismaModule } from './core/prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';

import { StoreModule } from './store/store.module';
import { CashboxModule } from './cashbox/cashbox.module';
import { CategoryModule } from './category/category.module';
import { ProductModule } from './product/product.module';
import { VendorModule } from './vendor/vendor.module';
import { ClientModule } from './client/client.module';
import { PriceTypeModule } from './pricetype/pricetype.module';
import { DocumentSaleModule } from './document-sale/document-sale.module';
import { DocumentPurchaseModule } from './document-purchase/document-purchase.module';
import { DocumentReturnModule } from './document-return/document-return.module';
import { DocumentAdjustmentModule } from './document-adjustment/document-adjustment.module';
import { DocumentTransferModule } from './document-transfer/document-transfer.module';
import { BarcodeModule } from './barcode/barcode.module';
import { PriceModule } from './price/price.module';
import { InventoryModule } from './core/inventory/inventory.module';
import { StockLedgerModule } from './stock-ledger/stock-ledger.module';
import { DocumentHistoryModule } from './document-history/document-history.module';
import { DocumentPriceChangeModule } from './document-price-change/document-price-change.module';
import { CommonModule } from './common/common.module';
import { SchedulerCoreModule } from './core/scheduler/scheduler.module';
import { CodeGeneratorModule } from './core/code-generator/code-generator.module';
import { AuthModule } from './core/auth/auth.module';
import { UsersModule } from './core/users/users.module';
import { JwtAuthGuard } from './core/auth/guards/jwt-auth.guard';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

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
    InventoryModule,
    StockLedgerModule,
    DocumentPriceChangeModule,
    DocumentHistoryModule,
    CommonModule,
    SchedulerCoreModule,
    CodeGeneratorModule,
    AuthModule,
    UsersModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
})
export class AppModule {}
