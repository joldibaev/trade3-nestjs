import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyCookie from '@fastify/cookie';
import { ZodValidationPipe } from 'nestjs-zod';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../../../src/app.module';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { TestHelper } from '../helpers/test-helper';
import request from 'supertest';
import { HttpAdapterHost } from '@nestjs/core';
import { HttpExceptionFilter } from '../../../src/common/filters/http-exception.filter';

describe('User Tracking (authorId) E2E', () => {
  let app: NestFastifyApplication;
  let helper: TestHelper;
  let prisma: PrismaService;
  let storeId: string;
  let vendorId: string;
  let categoryId: string;
  let productId: string;
  let userId: string;
  let accessToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.register(fastifyCookie);
    app.useGlobalPipes(new ZodValidationPipe());

    // Apply globals same as main.ts
    const httpAdapterHost = app.get(HttpAdapterHost);
    app.useGlobalFilters(new HttpExceptionFilter(httpAdapterHost));

    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    prisma = app.get(PrismaService);
    helper = new TestHelper(app, prisma);

    // Create test user and get auth token
    const testEmail = `test_${Date.now()}@example.com`;
    const testPassword = 'Password123!';

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: testEmail,
        password: testPassword,
      })
      .expect(201);

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: testEmail,
        password: testPassword,
      })
      .expect(200);

    accessToken = loginRes.body.accessToken;

    // Get user ID from database
    const user = await prisma.user.findUnique({
      where: { email: testEmail },
    });
    userId = user!.id;

    // Setup Test Data
    const store = await helper.createStore();
    storeId = store.id;

    const vendor = await helper.createVendor();
    vendorId = vendor.id;

    const category = await helper.createCategory();
    categoryId = category.id;

    const product = await helper.createProduct(categoryId);
    productId = product.id;
  });

  afterAll(async () => {
    // Cleanup test user
    if (userId) {
      await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    }
    await helper?.cleanup();
    await app.close();
  });

  describe('DocumentPurchase - authorId tracking', () => {
    let purchaseId: string;

    it('should record authorId when creating a purchase document', async () => {
      const createPayload = {
        storeId,
        vendorId,
        date: new Date().toISOString(),
      };

      const res = await request(app.getHttpServer())
        .post('/document-purchases')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(createPayload)
        .expect(201);

      purchaseId = res.body.id;
      helper.createdIds.purchases.push(purchaseId);

      // Verify authorId in DocumentPurchase
      const purchase = await prisma.documentPurchase.findUnique({
        where: { id: purchaseId },
      });

      expect(purchase?.authorId).toBe(userId);

      // Verify authorId in DocumentHistory
      const history = await prisma.documentHistory.findFirst({
        where: {
          documentPurchaseId: purchaseId,
          action: 'CREATED',
        },
      });

      expect(history?.authorId).toBe(userId);
    });

    it('should record authorId when adding items to purchase', async () => {
      const itemPayload = {
        items: [
          {
            productId,
            quantity: 10,
            price: 50,
            newPrices: [],
          },
        ],
      };

      await request(app.getHttpServer())
        .post(`/document-purchases/${purchaseId}/items`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(itemPayload)
        .expect(201);

      // Verify authorId in DocumentHistory for ITEM_ADDED action
      const history = await prisma.documentHistory.findFirst({
        where: {
          documentPurchaseId: purchaseId,
          action: 'ITEM_ADDED',
        },
      });

      expect(history?.authorId).toBe(userId);
    });

    it('should record authorId when updating purchase status', async () => {
      await request(app.getHttpServer())
        .patch(`/document-purchases/${purchaseId}/status`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ status: 'COMPLETED' })
        .expect(200);

      // Verify authorId in DocumentHistory for STATUS_CHANGED action
      const history = await prisma.documentHistory.findFirst({
        where: {
          documentPurchaseId: purchaseId,
          action: 'STATUS_CHANGED',
        },
      });

      expect(history?.authorId).toBe(userId);
    });

    it('should record authorId when updating item in purchase', async () => {
      // Create a new draft purchase for this test
      const createRes = await request(app.getHttpServer())
        .post('/document-purchases')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          storeId,
          vendorId,
          date: new Date().toISOString(),
        })
        .expect(201);

      const draftPurchaseId = createRes.body.id;
      helper.createdIds.purchases.push(draftPurchaseId);

      // Add an item
      await request(app.getHttpServer())
        .post(`/document-purchases/${draftPurchaseId}/items`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          items: [{ productId, quantity: 5, price: 100, newPrices: [] }],
        })
        .expect(201);

      // Update the item
      await request(app.getHttpServer())
        .patch(`/document-purchases/${draftPurchaseId}/items/${productId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ productId, quantity: 8, price: 100, newPrices: [] })
        .expect(200);

      // Verify authorId in DocumentHistory for ITEM_CHANGED action
      const history = await prisma.documentHistory.findFirst({
        where: {
          documentPurchaseId: draftPurchaseId,
          action: 'ITEM_CHANGED',
        },
      });

      expect(history?.authorId).toBe(userId);
    });

    it('should record authorId when removing items from purchase', async () => {
      // Create a new draft purchase for this test
      const createRes = await request(app.getHttpServer())
        .post('/document-purchases')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          storeId,
          vendorId,
          date: new Date().toISOString(),
        })
        .expect(201);

      const draftPurchaseId = createRes.body.id;
      helper.createdIds.purchases.push(draftPurchaseId);

      // Add an item
      await request(app.getHttpServer())
        .post(`/document-purchases/${draftPurchaseId}/items`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          items: [{ productId, quantity: 5, price: 100, newPrices: [] }],
        })
        .expect(201);

      // Remove the item
      await request(app.getHttpServer())
        .delete(`/document-purchases/${draftPurchaseId}/items`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ productIds: [productId] })
        .expect(200);

      // Verify authorId in DocumentHistory for ITEM_REMOVED action
      const history = await prisma.documentHistory.findFirst({
        where: {
          documentPurchaseId: draftPurchaseId,
          action: 'ITEM_REMOVED',
        },
      });

      expect(history?.authorId).toBe(userId);
    });
  });

  describe('Unauthenticated requests', () => {
    it('should still work without authentication (authorId should be null)', async () => {
      const createPayload = {
        storeId,
        vendorId,
        date: new Date().toISOString(),
      };

      const res = await request(app.getHttpServer())
        .post('/document-purchases')
        .send(createPayload)
        .expect(201);

      const purchaseId = res.body.id;
      helper.createdIds.purchases.push(purchaseId);

      // Verify authorId is null in DocumentPurchase
      const purchase = await prisma.documentPurchase.findUnique({
        where: { id: purchaseId },
      });

      expect(purchase?.authorId).toBeNull();

      // Verify authorId is null in DocumentHistory
      const history = await prisma.documentHistory.findFirst({
        where: {
          documentPurchaseId: purchaseId,
          action: 'CREATED',
        },
      });

      expect(history?.authorId).toBeNull();
    });
  });

  describe('DocumentHistory queries with author relation', () => {
    it('should be able to query DocumentHistory with author relation', async () => {
      const createPayload = {
        storeId,
        vendorId,
        date: new Date().toISOString(),
      };

      const res = await request(app.getHttpServer())
        .post('/document-purchases')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(createPayload)
        .expect(201);

      const purchaseId = res.body.id;
      helper.createdIds.purchases.push(purchaseId);

      // Query with author relation
      const history = await prisma.documentHistory.findFirst({
        where: {
          documentPurchaseId: purchaseId,
          action: 'CREATED',
        },
        include: {
          author: true,
        },
      });

      expect(history?.author).toBeDefined();
      expect(history?.author?.id).toBe(userId);
      expect(history?.author?.email).toBeDefined();
    });

    it('should be able to query all actions by a specific user', async () => {
      // Query all history entries created by this user
      const userHistory = await prisma.documentHistory.findMany({
        where: {
          authorId: userId,
        },
        include: {
          author: true,
        },
      });

      expect(userHistory.length).toBeGreaterThan(0);
      userHistory.forEach((entry) => {
        expect(entry.authorId).toBe(userId);
        expect(entry.author?.id).toBe(userId);
      });
    });
  });
});
