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
  ],
})
export class AppModule {}
