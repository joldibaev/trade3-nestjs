import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyCookie from '@fastify/cookie';
import { ZodValidationPipe } from 'nestjs-zod';
import { AppModule } from '../../../src/app.module';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { TestHelper } from '../helpers/test-helper';
import request from 'supertest';

describe('Stock Reservation (e2e)', () => {
  let app: NestFastifyApplication;
  let helper: TestHelper;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.register(fastifyCookie);
    app.useGlobalPipes(new ZodValidationPipe());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    prisma = app.get(PrismaService);
    helper = new TestHelper(app, prisma);
  });

  afterAll(async () => {
    await helper?.cleanup();
    await app.close();
  });

  it('should reserve stock when adding items to a DRAFT sale', async () => {
    const store = await helper.createStore();
    const cashbox = await helper.createCashbox(store.id);
    const category = await helper.createCategory();
    const product = await helper.createProduct(category.id);
    const { retail } = await helper.createPriceTypes();

    // 1. Setup physical stock: 10
    await helper.addStock(store.id, product.id, 10, 100);

    // 2. Create DRAFT Sale with 4 items
    const sale = await helper.createSale(
      store.id,
      cashbox.id,
      retail.id,
      product.id,
      4,
      200,
      undefined,
      'DRAFT',
    );

    // 3. Check Stock: Physical=10, Reserved=4
    const stock = await helper.getStock(product.id, store.id);
    expect(stock!.quantity.toNumber()).toBe(10);
    expect((stock as any).reserved.toNumber()).toBe(4);
  });

  it('should fail to add items to DRAFT if they exceed available (Phys - Reserved)', async () => {
    const store = await helper.createStore();
    const cashbox = await helper.createCashbox(store.id);
    const category = await helper.createCategory();
    const product = await helper.createProduct(category.id);
    const { retail } = await helper.createPriceTypes();

    // 1. Setup physical stock: 10
    await helper.addStock(store.id, product.id, 10, 100);

    // 2. Create first DRAFT Sale with 7 items (Available becomes 3)
    await helper.createSale(
      store.id,
      cashbox.id,
      retail.id,
      product.id,
      7,
      200,
      undefined,
      'DRAFT',
    );

    // 3. Try to create another DRAFT Sale with 5 items (Total 12 > 10)
    // This should fail in addItems validation
    const payload = {
      storeId: store.id,
      cashboxId: cashbox.id,
      priceTypeId: retail.id,
      date: new Date().toISOString(),
      status: 'DRAFT',
    };

    const resSale = await request(app.getHttpServer())
      .post('/document-sales')
      .send(payload)
      .expect(201);

    const saleId = resSale.body.id;

    const resItems = await request(app.getHttpServer())
      .post(`/document-sales/${saleId}/items`)
      .send({ items: [{ productId: product.id, quantity: 5, price: 200 }] })
      .expect(400);

    expect(resItems.body.error.message).toContain('Недостаточно свободного товара');
  });

  it('should release reservation and deduct physical stock upon completion', async () => {
    const store = await helper.createStore();
    const cashbox = await helper.createCashbox(store.id);
    const category = await helper.createCategory();
    const product = await helper.createProduct(category.id);
    const { retail } = await helper.createPriceTypes();

    // 1. Setup physical stock: 10
    await helper.addStock(store.id, product.id, 10, 100);

    // 2. Create DRAFT Sale with 3 items
    const sale = await helper.createSale(
      store.id,
      cashbox.id,
      retail.id,
      product.id,
      3,
      200,
      undefined,
      'DRAFT',
    );

    // 3. Complete Sale
    await helper.completeSale(sale.id, 'COMPLETED');

    // 4. Check Stock: Physical=7, Reserved=0
    const stock = await helper.getStock(product.id, store.id);
    expect(stock!.quantity.toNumber()).toBe(7);
    expect((stock as any).reserved.toNumber()).toBe(0);
  });

  it('should restore reservation and return physical stock when moving from COMPLETED to DRAFT', async () => {
    const store = await helper.createStore();
    const cashbox = await helper.createCashbox(store.id);
    const category = await helper.createCategory();
    const product = await helper.createProduct(category.id);
    const { retail } = await helper.createPriceTypes();

    // 1. Setup physical stock: 10
    await helper.addStock(store.id, product.id, 10, 100);

    // 2. Complete Sale with 4 items
    const sale = await helper.createSale(
      store.id,
      cashbox.id,
      retail.id,
      product.id,
      4,
      200,
      undefined,
      'COMPLETED',
    );

    // Verify stock deduction
    let stock = await helper.getStock(product.id, store.id);
    expect(stock!.quantity.toNumber()).toBe(6);
    expect((stock as any).reserved.toNumber()).toBe(0);

    // 3. Move back to DRAFT
    await helper.completeSale(sale.id, 'DRAFT');

    // 4. Check Stock: Physical=10, Reserved=4
    stock = await helper.getStock(product.id, store.id);
    expect(stock!.quantity.toNumber()).toBe(10);
    expect((stock as any).reserved.toNumber()).toBe(4);
  });

  it('should migrate reservations when changing store in DRAFT sale', async () => {
    const store1 = await helper.createStore();
    const store2 = await helper.createStore();
    const cashbox1 = await helper.createCashbox(store1.id);
    const category = await helper.createCategory();
    const product = await helper.createProduct(category.id);
    const { retail } = await helper.createPriceTypes();

    // 1. Setup stock in BOTH stores
    await helper.addStock(store1.id, product.id, 10, 100);
    await helper.addStock(store2.id, product.id, 10, 100);

    // 2. Create DRAFT Sale in Store 1 with 6 items
    const sale = await helper.createSale(
      store1.id,
      cashbox1.id,
      retail.id,
      product.id,
      6,
      200,
      undefined,
      'DRAFT',
    );

    const cashbox2 = await helper.createCashbox(store2.id);

    // Check store 1 has reservation
    let stock1 = await helper.getStock(product.id, store1.id);
    expect((stock1 as any).reserved.toNumber()).toBe(6);

    // 3. Update Sale to Store 2 (must also provide cashbox2 since it's required in DTO)
    await request(app.getHttpServer())
      .patch(`/document-sales/${sale.id}`)
      .send({ storeId: store2.id, cashboxId: cashbox2.id })
      .expect(200);

    // 4. Check Stock 1: Reserved=0, Stock 2: Reserved=6
    stock1 = await helper.getStock(product.id, store1.id);
    let stock2 = await helper.getStock(product.id, store2.id);

    expect((stock1 as any).reserved.toNumber()).toBe(0);
    expect((stock2 as any).reserved.toNumber()).toBe(6);
  });
});
