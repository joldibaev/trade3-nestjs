import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyCookie from '@fastify/cookie';
import { ZodValidationPipe } from 'nestjs-zod';
import { AppModule } from '../../../src/app.module';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { TestHelper } from '../helpers/test-helper';

describe('Document Sale Status (e2e)', () => {
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

    const prisma = app.get(PrismaService);

    helper = new TestHelper(app, prisma);
  });

  afterAll(async () => {
    await helper?.cleanup();
    await app.close();
  });

  it('should revert stock when changing from COMPLETED to DRAFT', async () => {
    const store = await helper.createStore();
    const cashbox = await helper.createCashbox(store.id);
    const vendor = await helper.createVendor();
    const category = await helper.createCategory();
    const product = await helper.createProduct(category.id);
    const { retail } = await helper.createPriceTypes();

    // 1. Initial Stock: 10
    await helper.createPurchase(store.id, vendor.id, product.id, 10, 100);

    // 2. Sale: 5 items
    // 2. Sale: 5 items
    const sale = await helper.createSale(
      store.id,
      cashbox.id,
      retail.id,
      product.id,
      5,
      200,
      undefined,
      'COMPLETED',
    );
    // helper.createdIds.sales.push(sale.id); // Handled by helper

    const stockAfterSale = await helper.getStock(product.id, store.id);
    expect(stockAfterSale!.quantity.toString()).toBe('5');

    // 3. Revert Sale (DRAFT)
    // 3. Revert Sale (DRAFT)
    await helper.completeSale(sale.id, 'DRAFT');

    const stockAfterRevert = await helper.getStock(product.id, store.id);
    expect(stockAfterRevert!.quantity.toString()).toBe('10'); // Validates stock is returned
  });

  it('should force CANCELLED logic same as DRAFT (Stock Returned)', async () => {
    const store = await helper.createStore();
    const cashbox = await helper.createCashbox(store.id);
    const vendor = await helper.createVendor();
    const category = await helper.createCategory();
    const product = await helper.createProduct(category.id);
    const { retail } = await helper.createPriceTypes();

    // 1. Initial Stock: 10
    await helper.createPurchase(store.id, vendor.id, product.id, 10, 100);

    // 2. Sale: 5 items
    // 2. Sale: 5 items
    const sale = await helper.createSale(
      store.id,
      cashbox.id,
      retail.id,
      product.id,
      5,
      200,
      undefined,
      'COMPLETED',
    );

    // 3. Cancel Sale
    // 3. Cancel Sale
    await helper.completeSale(sale.id, 'CANCELLED');

    const stockAfterCancel = await helper.getStock(product.id, store.id);
    expect(stockAfterCancel!.quantity.toString()).toBe('10');
  });

  it('should be idempotent (no changes if status same)', async () => {
    const store = await helper.createStore();
    const cashbox = await helper.createCashbox(store.id);
    const vendor = await helper.createVendor();
    const category = await helper.createCategory();
    const product = await helper.createProduct(category.id);
    const { retail } = await helper.createPriceTypes();

    await helper.createPurchase(store.id, vendor.id, product.id, 10, 100);

    // 2. Sale: 5 items
    const sale = await helper.createSale(
      store.id,
      cashbox.id,
      retail.id,
      product.id,
      5,
      200,
      undefined,
      'COMPLETED',
    );
    // helper.createdIds.sales.push(sale.id); // Handled by helper

    // 3. Update Status to COMPLETED (Same)
    const res = await helper.completeSale(sale.id, 'COMPLETED');

    const stock = await helper.getStock(product.id, store.id);
    expect(stock!.quantity.toString()).toBe('5'); // Should remain 5, not double deducted
  });
});
