import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyCookie from '@fastify/cookie';
import { ZodValidationPipe } from 'nestjs-zod';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { TestHelper } from '../helpers/test-helper';
import { HttpAdapterHost } from '@nestjs/core';
import { HttpExceptionFilter } from '../../../src/common/filters/http-exception.filter';

describe('Product Last Purchase Price (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let helper: TestHelper;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.register(fastifyCookie);
    app.useGlobalPipes(new ZodValidationPipe());

    // Apply globals
    const httpAdapterHost = app.get(HttpAdapterHost);
    app.useGlobalFilters(new HttpExceptionFilter(httpAdapterHost));

    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    prisma = moduleFixture.get<PrismaService>(PrismaService);
    helper = new TestHelper(app, prisma);
  });

  afterAll(async () => {
    await helper?.cleanup();
    await app.close();
  });

  it('should return 0 when no purchases exist', async () => {
    const category = await helper.createCategory();
    const product = await helper.createProduct(category.id);

    const res = await request(app.getHttpServer())
      .get(`/products/${product.id}/last-purchase-price`)
      .expect(200);

    expect(Number(res.text)).toBe(0);
  });

  it('should return the price from the most recent purchase', async () => {
    const store = await helper.createStore();
    const vendor = await helper.createVendor();
    const category = await helper.createCategory();
    const product = await helper.createProduct(category.id);

    // 1. Create First Purchase (Older)
    await createPurchaseWithItem(store.id, vendor.id, product.id, 100, new Date('2023-01-01'));

    // Verify it returns 100
    let res = await request(app.getHttpServer())
      .get(`/products/${product.id}/last-purchase-price`)
      .expect(200);
    expect(Number(res.text)).toBe(100);

    // 2. Create Second Purchase (Newer)
    await createPurchaseWithItem(store.id, vendor.id, product.id, 200, new Date('2024-01-01'));

    // Verify it returns 200
    res = await request(app.getHttpServer())
      .get(`/products/${product.id}/last-purchase-price`)
      .expect(200);
    expect(Number(res.text)).toBe(200);
  });

  // Helper function to create purchase with item
  async function createPurchaseWithItem(
    storeId: string,
    vendorId: string,
    productId: string,
    price: number,
    date: Date,
  ) {
    const purchaseRes = await request(app.getHttpServer())
      .post('/document-purchases')
      .send({
        storeId,
        vendorId,
        date: date.toISOString(),
      })
      .expect(201);

    const purchaseId = purchaseRes.body.id;
    helper.createdIds.purchases.push(purchaseId);

    await request(app.getHttpServer())
      .post(`/document-purchases/${purchaseId}/items`)
      .send({ items: [{ productId, quantity: 10, price, newPrices: [] }] })
      .expect(201);

    return purchaseId;
  }
});
