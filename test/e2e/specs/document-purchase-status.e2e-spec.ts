import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyCookie from '@fastify/cookie';
import { ZodValidationPipe } from 'nestjs-zod';
import { AppModule } from '../../../src/app.module';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { TestHelper } from '../helpers/test-helper';

describe('Document Purchase Status (e2e)', () => {
  let app: NestFastifyApplication;
  let helper: TestHelper;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.register(fastifyCookie);
    app.useGlobalPipes(new ZodValidationPipe());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const prismaService = app.get(PrismaService);

    helper = new TestHelper(app, prismaService);
  });

  afterAll(async () => {
    await helper?.cleanup();
    await app.close();
  });

  it('should revert stock when changing from COMPLETED to DRAFT', async () => {
    const store = await helper.createStore();
    const vendor = await helper.createVendor();
    const category = await helper.createCategory();
    const product = await helper.createProduct(category.id);

    // 1. Create Purchase (COMPLETED)
    const purchase = await helper.createPurchase(
      store.id,
      vendor.id,
      product.id,
      10,
      100,
      'COMPLETED',
    );
    // createdIds.purchases.push is already handled in helper

    const stockBefore = await helper.getStock(product.id, store.id);
    expect(stockBefore!.quantity.toString()).toBe('10');

    // 2. Revert to DRAFT
    // 2. Revert to DRAFT
    await helper.completePurchase(purchase.id, 'DRAFT');

    const stockAfter = await helper.getStock(product.id, store.id);
    // Stock should be 0 (or null if fully removed, but our logic likely keeps record with 0)
    // Actually our logic keeps the record but quantity becomes 0.
    expect(stockAfter!.quantity.toString()).toBe('0');
  });

  it('should forbid reverting if stock would become negative (e.g. after sale)', async () => {
    const store = await helper.createStore();
    const cashbox = await helper.createCashbox(store.id);
    const vendor = await helper.createVendor();
    const category = await helper.createCategory();
    const product = await helper.createProduct(category.id);
    const { retail } = await helper.createPriceTypes();

    // 1. Purchase 10 items
    // 1. Purchase 10 items
    const purchase = await helper.createPurchase(
      store.id,
      vendor.id,
      product.id,
      10,
      100,
      'COMPLETED',
      [{ priceTypeId: retail.id, value: 200 }],
    );

    // 2. Sell 5 items
    await helper.createSale(store.id, cashbox.id, retail.id, product.id, 5, 200);

    // Current Stock: 5.
    // Trying to revert purchase (-10) would result in -5.

    // 3. Try to revert purchase
    const res = await helper.completePurchase(purchase.id, 'DRAFT', 400);
    expect(res.message).toBeDefined();
  });

  it('should allow re-completing a reverted purchase', async () => {
    const store = await helper.createStore();
    const vendor = await helper.createVendor();
    const category = await helper.createCategory();
    const product = await helper.createProduct(category.id);

    // 1. Create Purchase (COMPLETED)
    const purchase = await helper.createPurchase(
      store.id,
      vendor.id,
      product.id,
      10,
      100,
      'COMPLETED',
    );
    // helper.createdIds.purchases.push(purchase.id) is handled by createPurchase

    // 2. Revert to DRAFT
    await helper.completePurchase(purchase.id, 'DRAFT');
    const stockZero = await helper.getStock(product.id, store.id);
    expect(stockZero!.quantity.toString()).toBe('0');

    // 3. Complete again
    await helper.completePurchase(purchase.id, 'COMPLETED');
    const stockFinal = await helper.getStock(product.id, store.id);
    expect(stockFinal!.quantity.toString()).toBe('10');
  });

  it('should handle cancel status same as draft (revert stock)', async () => {
    const store = await helper.createStore();
    const vendor = await helper.createVendor();
    const category = await helper.createCategory();
    const product = await helper.createProduct(category.id);

    // 1. Create Purchase (COMPLETED)
    const purchase = await helper.createPurchase(
      store.id,
      vendor.id,
      product.id,
      5,
      500,
      'COMPLETED',
    );
    helper.createdIds.purchases.push(purchase.id);

    // 2. Cancel
    await helper.completePurchase(purchase.id, 'CANCELLED');

    const stock = await helper.getStock(product.id, store.id);
    expect(stock!.quantity.toString()).toBe('0');
  });
  it('should forbid reverting if stock value (WAP) would become negative', async () => {
    const store = await helper.createStore();
    const cashbox = await helper.createCashbox(store.id);
    const vendor = await helper.createVendor();
    const category = await helper.createCategory();
    const product = await helper.createProduct(category.id);
    const { retail } = await helper.createPriceTypes();

    // 1. Buy Cheap (10 @ 10$) - WAP 10
    await helper.createPurchase(store.id, vendor.id, product.id, 10, 10);

    // 2. Buy Expensive (10 @ 100$) - Total Qty 20, Total Value 1100, WAP 55
    const expensivePurchase = await helper.createPurchase(
      store.id,
      vendor.id,
      product.id,
      10,
      100,
      'COMPLETED',
    );
    helper.createdIds.purchases.push(expensivePurchase.id);

    // Current Stock: 20 @ 55 (Total Value 1100)

    // 3. Sell (10 items). Cost of Goods Sold = 10 * 55 = 550.
    // Remaining Stock: 10 items. Remaining Value = 550.
    await helper.createSale(store.id, cashbox.id, retail.id, product.id, 10, 200);

    // 4. Try to revert "Expensive Purchase" (10 @ 100 = 1000 value)
    // We have 550 value in stock. We want to remove 1000 value.
    // Result would be negative value. blocked.
    const res = await helper.completePurchase(expensivePurchase.id, 'DRAFT', 400);
    expect(res.message).toBeDefined();
  });
});
