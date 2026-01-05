import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, BadRequestException } from '@nestjs/common';
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

describe('Document Sale (e2e)', () => {
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

  it('should decrease stock on sale', async () => {
    const store = await helper.createStore();
    const cashbox = await helper.createCashbox(store.id);
    const vendor = await helper.createVendor();
    const category = await helper.createCategory();
    const product = await helper.createProduct(category.id);
    const { retail } = await helper.createPriceTypes();

    await helper.createPurchase(store.id, vendor.id, product.id, 25, 5400);
    await helper.createSale(
      store.id,
      cashbox.id,
      retail.id,
      product.id,
      5,
      7000,
    );

    const stock = await helper.getStock(product.id, store.id);
    expect(stock!.quantity.toString()).toBe('20');
  });

  it('should not change WAP on sale', async () => {
    const store = await helper.createStore();
    const cashbox = await helper.createCashbox(store.id);
    const vendor = await helper.createVendor();
    const category = await helper.createCategory();
    const product = await helper.createProduct(category.id);
    const { retail } = await helper.createPriceTypes();

    await helper.createPurchase(store.id, vendor.id, product.id, 10, 5000);
    const stockBefore = await helper.getStock(product.id, store.id);

    await helper.createSale(
      store.id,
      cashbox.id,
      retail.id,
      product.id,
      1,
      10000,
    );
    const stockAfter = await helper.getStock(product.id, store.id);

    expect(stockAfter!.averagePurchasePrice.toFixed(2)).toBe(
      stockBefore!.averagePurchasePrice.toFixed(2),
    );
  });

  it('should reject sale attempt with zero stock', async () => {
    const store = await helper.createStore();
    const cashbox = await helper.createCashbox(store.id);
    const category = await helper.createCategory();
    const product = await helper.createProduct(category.id);
    const { retail } = await helper.createPriceTypes();

    await expect(
      helper.createSale(store.id, cashbox.id, retail.id, product.id, 5, 7000),
    ).rejects.toThrow(BadRequestException);
  });

  it('should rollback stock update if sale fails mid-way (atomicity check)', async () => {
    const store = await helper.createStore();
    const cashbox = await helper.createCashbox(store.id);
    const vendor = await helper.createVendor();
    const category = await helper.createCategory();
    const product1 = await helper.createProduct(category.id);
    const product2 = await helper.createProduct(category.id);
    const { retail } = await helper.createPriceTypes();

    // Stock: Product1 has 10, Product2 has 0
    await helper.createPurchase(store.id, vendor.id, product1.id, 10, 1000);

    // Try to sell both. Product2 should trigger BadRequestException.
    const salePromise = app.get(DocumentSaleService).create({
      storeId: store.id,
      cashboxId: cashbox.id,
      priceTypeId: retail.id,
      date: new Date().toISOString(),
      status: 'COMPLETED',
      items: [
        { productId: product1.id, quantity: 5, price: 2000 },
        { productId: product2.id, quantity: 5, price: 2000 }, // This will fail
      ],
    });

    await expect(salePromise).rejects.toThrow(BadRequestException);

    // Verify Product 1 stock was NOT decreased
    const stock1 = await helper.getStock(product1.id, store.id);
    expect(stock1!.quantity.toString()).toBe('10');

    // Ensure no partial sale document was created
    const salesCount = await app.get(PrismaService).documentSale.count({
      where: { storeId: store.id },
    });
    expect(salesCount).toBe(0);
  });
});
