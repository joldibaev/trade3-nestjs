import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyCookie from '@fastify/cookie';
import { ZodValidationPipe } from 'nestjs-zod';
import { AppModule } from '../../../src/app.module';
import { PrismaService } from '../../../src/core/prisma/prisma.service';
import { TestHelper } from '../helpers/test-helper';
import request from 'supertest';

describe('Reporting Modules (PriceHistory & StockMovement)', () => {
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

  it('should retrieve stock movements with filters', async () => {
    const store = await helper.createStore();
    const vendor = await helper.createVendor();
    const category = await helper.createCategory();
    const product = await helper.createProduct(category.id);

    // Create purchase (generates StockMovement)
    const purchase = await helper.createPurchase(store.id, vendor.id, product.id, 50, 1000);
    // completePurchase is called inside createPurchase if status is not passed or 'COMPLETED' (default is 'COMPLETED')
    // Check helper implementation:
    // createPurchase(...) defaults to 'COMPLETED' and calls completePurchase?
    // Let's verify helper. createPurchase signature:
    // async createPurchase(..., status: DocumentStatus = 'COMPLETED', ...)

    // Test GET /stock-movements with productId and storeId
    const response = await request(app.getHttpServer())
      .get('/stock-ledgers')
      .query({ productId: product.id, storeId: store.id })
      .expect(200);

    expect(response.body).toBeInstanceOf(Array);
    expect(response.body.length).toBeGreaterThan(0);
    expect(response.body[0].type).toBe('PURCHASE');
    expect(response.body[0].quantity).toBe('50');

    // Test GET /stock-movements with type
    const responseType = await request(app.getHttpServer())
      .get('/stock-ledgers')
      .query({ type: 'PURCHASE' })
      .expect(200);

    expect(responseType.body.length).toBeGreaterThan(0);
    expect(responseType.body[0].type).toBe('PURCHASE');
  });
});
