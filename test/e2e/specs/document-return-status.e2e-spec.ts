import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyCookie from '@fastify/cookie';
import { ZodValidationPipe } from 'nestjs-zod';
import { AppModule } from '../../../src/app.module';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { TestHelper } from '../helpers/test-helper';

describe('Document Return Status (e2e)', () => {
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
    const client = await helper.createClient();
    const category = await helper.createCategory();
    const product = await helper.createProduct(category.id);

    // 1. Initial Stock: 0
    const stockInitial = await helper.getStock(product.id, store.id);
    expect(stockInitial).toBeNull();

    // 2. Return 5 items from client (Stock +5)
    // 2. Return 5 items from client (Stock +5)
    const doc = await helper.createReturn(store.id, client.id, product.id, 5, 100, 'COMPLETED');

    const stockAfterReturn = await helper.getStock(product.id, store.id);
    expect(stockAfterReturn!.quantity.toString()).toBe('5');

    // 3. Revert Return (DRAFT) (Stock -5 -> 0)
    // 3. Revert Return (DRAFT) (Stock -5 -> 0)
    await helper.completeReturn(doc.id, 'DRAFT');

    const stockAfterRevert = await helper.getStock(product.id, store.id);
    expect(stockAfterRevert!.quantity.toString()).toBe('0');
  });

  it('should forbid reverting if stock is insufficient', async () => {
    const store = await helper.createStore();
    const cashbox = await helper.createCashbox(store.id);
    const client = await helper.createClient();
    const category = await helper.createCategory();
    const product = await helper.createProduct(category.id);
    const { retail } = await helper.createPriceTypes();

    // 1. Return 10 items (Stock becomes 10)
    // 1. Return 10 items (Stock becomes 10)
    const doc = await helper.createReturn(store.id, client.id, product.id, 10, 100, 'COMPLETED');

    // 2. Sell 8 items (Stock becomes 2)
    await helper.createSale(store.id, cashbox.id, retail.id, product.id, 8, 200);

    // 3. Try to Revert Return (Needs 10, Has 2) -> Fail
    // 3. Try to Revert Return (Needs 10, Has 2) -> Fail
    const res = await helper.completeReturn(doc.id, 'DRAFT', 400);
    expect(res.message).toBeDefined();
  });
});
