import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { PrismaService } from '../../../src/core/prisma/prisma.service';
import { TestHelper } from '../helpers/test-helper';

describe('Document Sale (e2e)', () => {
  let app: INestApplication;
  let helper: TestHelper;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    const prisma = app.get(PrismaService);
    helper = new TestHelper(app, prisma);
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
    await helper.createSale(store.id, cashbox.id, retail.id, product.id, 5, 7000);

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

    await helper.createSale(store.id, cashbox.id, retail.id, product.id, 1, 10000);
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

    const res = await helper.createSale(
      store.id,
      cashbox.id,
      retail.id,
      product.id,
      5,
      7000,
      undefined,
      'COMPLETED',
      400,
    );
    expect(res.message).toBeDefined(); // or check specific error message
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
    // Try to sell both. Product2 should trigger BadRequestException.
    const res = await request(app.getHttpServer())
      .post('/document-sales')
      .send({
        storeId: store.id,
        cashboxId: cashbox.id,
        priceTypeId: retail.id,
        date: new Date().toISOString(),
        status: 'COMPLETED',
        items: [
          { productId: product1.id, quantity: 5, price: 2000 },
          { productId: product2.id, quantity: 5, price: 2000 }, // This will fail
        ],
      })
      .expect(400);

    // Verify Product 1 stock was NOT decreased
    const stock1 = await helper.getStock(product1.id, store.id);
    expect(stock1!.quantity.toString()).toBe('10');

    // Ensure no partial sale document was created
    const salesCount = await app.get(PrismaService).documentSale.count({
      where: { storeId: store.id },
    });
    expect(salesCount).toBe(0);
  });

  it('should not update stock if sale is DRAFT and update when completed', async () => {
    const store = await helper.createStore();
    const cashbox = await helper.createCashbox(store.id);
    const vendor = await helper.createVendor();
    const category = await helper.createCategory();
    const product = await helper.createProduct(category.id);
    const { retail } = await helper.createPriceTypes();

    await helper.createPurchase(store.id, vendor.id, product.id, 10, 5000);

    // 1. Create DRAFT sale
    const sale = await helper.createSale(
      store.id,
      cashbox.id,
      retail.id,
      product.id,
      3,
      7000,
      undefined,
      'DRAFT',
    );

    // Verify stock is still 10
    const stockDraft = await helper.getStock(product.id, store.id);
    expect(stockDraft!.quantity.toString()).toBe('10');

    // 2. Complete the sale
    await helper.completeSale(sale.id);

    // Verify stock is now 7
    const stockAfter = await helper.getStock(product.id, store.id);
    expect(stockAfter!.quantity.toString()).toBe('7');
  });
});
