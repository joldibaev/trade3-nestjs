import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../../src/app.module';
import { PrismaService } from '../../../src/core/prisma/prisma.service';
import { TestHelper } from '../helpers/test-helper';
import { DocumentPurchaseService } from '../../../src/document-purchase/document-purchase.service';
import { StoreService } from '../../../src/store/store.service';
import { CashboxService } from '../../../src/cashbox/cashbox.service';
import { VendorService } from '../../../src/vendor/vendor.service';
import { ClientService } from '../../../src/client/client.service';
import { PriceTypeService } from '../../../src/pricetype/pricetype.service';
import { ProductService } from '../../../src/product/product.service';
import { CategoryService } from '../../../src/category/category.service';
import { DocumentSaleService } from '../../../src/document-sale/document-sale.service';
import { DocumentReturnService } from '../../../src/document-return/document-return.service';
import { DocumentAdjustmentService } from '../../../src/document-adjustment/document-adjustment.service';
import { DocumentTransferService } from '../../../src/document-transfer/document-transfer.service';
import { Prisma } from '../../../src/generated/prisma/client';
import Decimal = Prisma.Decimal;

describe('Document Purchase (e2e)', () => {
  let app: INestApplication;
  let helper: TestHelper;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    helper = new TestHelper(
      app.get(PrismaService),
      app.get(StoreService),
      app.get(CashboxService),
      app.get(VendorService),
      app.get(ClientService),
      app.get(PriceTypeService),
      app.get(ProductService),
      app.get(CategoryService),
      app.get(DocumentPurchaseService),
      app.get(DocumentSaleService),
      app.get(DocumentReturnService),
      app.get(DocumentAdjustmentService),
      app.get(DocumentTransferService),
    );
  });

  afterAll(async () => {
    await helper.cleanup();
    await app.close();
  });

  it('should create stock on first purchase', async () => {
    const store = await helper.createStore();
    const vendor = await helper.createVendor();
    const category = await helper.createCategory();
    const product = await helper.createProduct(category.id);

    const purchase = await helper.createPurchase(
      store.id,
      vendor.id,
      product.id,
      10,
      5000,
    );

    expect(purchase.totalAmount.toString()).toBe('50000');
    const stock = await helper.getStock(product.id, store.id);
    expect(stock!.quantity.toString()).toBe('10');
    expect(stock!.averagePurchasePrice.toFixed(2)).toBe('5000.00');
  });

  it('should update stock on second purchase with same price', async () => {
    const store = await helper.createStore();
    const vendor = await helper.createVendor();
    const category = await helper.createCategory();
    const product = await helper.createProduct(category.id);

    await helper.createPurchase(store.id, vendor.id, product.id, 10, 5000);
    await helper.createPurchase(store.id, vendor.id, product.id, 5, 5000);

    const stock = await helper.getStock(product.id, store.id);
    expect(stock!.quantity.toString()).toBe('15');
    expect(stock!.averagePurchasePrice.toFixed(2)).toBe('5000.00');
  });

  it('should calculate WAP on purchase with different price', async () => {
    const store = await helper.createStore();
    const vendor = await helper.createVendor();
    const category = await helper.createCategory();
    const product = await helper.createProduct(category.id);

    await helper.createPurchase(store.id, vendor.id, product.id, 15, 5000);
    await helper.createPurchase(store.id, vendor.id, product.id, 10, 6000);

    // WAP: (15*5000 + 10*6000) / 25 = 135000 / 25 = 5400
    const stock = await helper.getStock(product.id, store.id);
    expect(stock!.quantity.toString()).toBe('25');
    expect(stock!.averagePurchasePrice.toFixed(2)).toBe('5400.00');
  });

  it('should update product prices during purchase', async () => {
    const store = await helper.createStore();
    const vendor = await helper.createVendor();
    const category = await helper.createCategory();
    const product = await helper.createProduct(category.id);
    const { retail, wholesale } = await helper.createPriceTypes();

    const purchase = await helper.createPurchase(
      store.id,
      vendor.id,
      product.id,
      10,
      1000,
      'COMPLETED',
      [
        { priceTypeId: retail.id, value: 1500 },
        { priceTypeId: wholesale.id, value: 1200 },
      ],
    );

    const prices = await app.get(PrismaService).price.findMany({
      where: { productId: product.id },
    });
    expect(prices.length).toBe(2);
    const splitRetail = prices.find((p) => p.priceTypeId === retail.id);
    const splitWholesale = prices.find((p) => p.priceTypeId === wholesale.id);

    expect(splitRetail?.value.toString()).toBe('1500');
    expect(splitWholesale?.value.toString()).toBe('1200');
  });
});
