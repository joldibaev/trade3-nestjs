import { Module } from '@nestjs/common';
import { PrismaModule } from './core/prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { UserModule } from './user/user.module';
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
import { StockMovementModule } from './stock-movement/stock-movement.module';
import { PriceHistoryModule } from './price-history/price-history.module';

@Module({
  imports: [
    PrismaModule,
    PrometheusModule.register(),
    ConfigModule.forRoot({ isGlobal: true }),
    UserModule,
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
    StockMovementModule,
    PriceHistoryModule,
  ],
})
export class AppModule {}
