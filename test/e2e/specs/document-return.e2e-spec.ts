import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyCookie from '@fastify/cookie';
import { ZodValidationPipe } from 'nestjs-zod';
import { AppModule } from '../../../src/app.module';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { TestHelper } from '../helpers/test-helper';

describe('Document Return (e2e)', () => {
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

  it('should infer WAP from other store during return if local stock is missing', async () => {
    const storeA = await helper.createStore();
    const storeB = await helper.createStore();
    const vendor = await helper.createVendor();
    const category = await helper.createCategory();
    const product = await helper.createProduct(category.id);
    const client = await helper.createClient();

    // 1. Purchase in Store A (sets global availability of cost info)
    await helper.createPurchase(storeA.id, vendor.id, product.id, 10, 5000);

    // 2. Return in Store B (where stock is 0/missing)
    // 2. Return in Store B (where stock is 0/missing)
    const returnDoc = await helper.createReturn(
      storeB.id,
      client.id,
      product.id,
      2,
      5000,
      'COMPLETED',
    );
    // helper.createdIds.returns.push(returnDoc.id); // Handled by helper

    // Verify Store B stock
    const stockB = await helper.getStock(product.id, storeB.id);
    expect(stockB!.quantity.toString()).toBe('2');
    expect(stockB!.averagePurchasePrice.toFixed(2)).toBe('5000.00');
  });

  it('should not update stock if return is DRAFT and update when completed', async () => {
    const store = await helper.createStore();
    const category = await helper.createCategory();
    const product = await helper.createProduct(category.id);
    const client = await helper.createClient();

    // 1. Create DRAFT return
    const returnDoc = await helper.createReturn(store.id, client.id, product.id, 5, 1000, 'DRAFT');

    // Verify stock is null/zero
    const stockDraft = await helper.getStock(product.id, store.id);
    expect(stockDraft).toBeNull();

    // 2. Complete return
    await helper.completeReturn(returnDoc.id);

    // Verify stock updated
    const stockAfter = await helper.getStock(product.id, store.id);
    expect(stockAfter!.quantity.toString()).toBe('5');
  });
});
