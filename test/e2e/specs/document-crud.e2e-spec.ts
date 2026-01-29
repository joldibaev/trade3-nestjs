import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyCookie from '@fastify/cookie';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { TestHelper } from '../helpers/test-helper';

describe('Document CRUD (e2e)', () => {
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
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    prisma = moduleFixture.get<PrismaService>(PrismaService);

    helper = new TestHelper(app, prisma);
    await helper?.cleanup();
  });

  afterAll(async () => {
    await helper?.cleanup();
    await app.close();
  });

  describe('Document Purchase CRUD', () => {
    let storeId: string;
    let vendorId: string;
    let productId: string;
    let purchaseId: string;

    beforeAll(async () => {
      storeId = (await helper.createStore()).id;
      vendorId = (await helper.createVendor()).id;
      const category = await helper.createCategory();
      productId = (await helper.createProduct(category.id)).id;
    });

    it('should create a DRAFT purchase', async () => {
      // 1. Create Header
      const res = await request(app.getHttpServer())
        .post('/document-purchases')
        .send({
          storeId,
          vendorId,
          date: new Date(),
        })
        .expect(201);

      purchaseId = res.body.id;
      expect(res.body.status).toBe('DRAFT');
      expect(res.body.items).toHaveLength(0);
      expect(res.body.code).toBeDefined();
      expect(typeof res.body.code).toBe('string');

      helper.createdIds.purchases.push(purchaseId);

      // 2. Add Item
      const itemRes = await request(app.getHttpServer())
        .post(`/document-purchases/${purchaseId}/items`)
        .send({ items: [{ productId, quantity: 10, price: 100 }] })
        .expect(201);

      // Verify header returned from findOne (or addItem return)
      expect(itemRes.body.items).toHaveLength(1);
      expect(itemRes.body.items[0].quantity).toBe('10');
    });

    it('should update DRAFT purchase item', async () => {
      // Find item ID
      const docBefore = await prisma.documentPurchase.findUnique({
        where: { id: purchaseId },
        include: { items: true },
      });
      const itemId = docBefore?.items[0].productId; // DocumentPurchaseService use productId as itemId in updateItem logic if matched

      const res = await request(app.getHttpServer())
        .patch(`/document-purchases/${purchaseId}/items/${itemId}`)
        .send({ quantity: 20, price: 120 })
        .expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].quantity).toBe('20');
      expect(res.body.items[0].price).toBe('120');

      // Verify in DB
      const doc = await prisma.documentPurchase.findUnique({
        where: { id: purchaseId },
        include: { items: true },
      });
      expect(doc?.items![0].quantity.toString()).toBe('20');
    });

    it('should complete purchase', async () => {
      await request(app.getHttpServer())
        .patch(`/document-purchases/${purchaseId}/status`)
        .send({ status: 'COMPLETED' })
        .expect(200);
    });

    it('should NOT update COMPLETED purchase header (nor items)', async () => {
      await request(app.getHttpServer())
        .patch(`/document-purchases/${purchaseId}`)
        .send({
          notes: 'Attempt update',
        })
        .expect(400);

      await request(app.getHttpServer())
        .post(`/document-purchases/${purchaseId}/items`)
        .send({ items: [{ productId, quantity: 5, price: 50 }] })
        .expect(400);
    });

    it('should NOT delete COMPLETED purchase (endpoint removed)', async () => {
      await request(app.getHttpServer()).delete(`/document-purchases/${purchaseId}`).expect(404);
    });

    it('should revert purchase to DRAFT', async () => {
      await request(app.getHttpServer())
        .patch(`/document-purchases/${purchaseId}/status`)
        .send({ status: 'DRAFT' })
        .expect(200);
    });

    it('should NOT delete DRAFT purchase (endpoint removed)', async () => {
      await request(app.getHttpServer()).delete(`/document-purchases/${purchaseId}`).expect(404);
    });
  });

  describe('Document Sale CRUD', () => {
    let storeId: string;
    let clientId: string;
    let cashboxId: string;
    let productId: string;
    let saleId: string;

    beforeAll(async () => {
      storeId = (await helper.createStore()).id;
      clientId = (await helper.createClient()).id;
      cashboxId = (await helper.createCashbox(storeId)).id;
      const category = await helper.createCategory();
      productId = (await helper.createProduct(category.id)).id;
      // Add stock
      await helper.addStock(storeId, productId, 100, 50);
    });

    it('should create a DRAFT sale', async () => {
      const res = await request(app.getHttpServer())
        .post('/document-sales')
        .send({
          storeId,
          clientId,
          cashboxId,
          date: new Date(),
          status: 'DRAFT',
        })
        .expect(201);

      saleId = res.body.id;
      expect(res.body.status).toBe('DRAFT');
      expect(res.body.code).toBeDefined();

      // Add item
      const itemRes = await request(app.getHttpServer())
        .post(`/document-sales/${saleId}/items`)
        .send({ items: [{ productId, quantity: 5, price: 100 }] })
        .expect(201);

      expect(itemRes.body.items).toHaveLength(1);
      helper.createdIds.sales.push(saleId);
    });

    it('should update DRAFT sale item', async () => {
      const docBefore = await prisma.documentSale.findUnique({
        where: { id: saleId },
        include: { items: true },
      });
      const itemId = docBefore?.items[0].id;

      const res = await request(app.getHttpServer())
        .patch(`/document-sales/${saleId}/items/${itemId}`)
        .send({ quantity: 10, price: 100 })
        .expect(200);

      expect(res.body.items[0].quantity).toBe('10');
    });

    it('should complete sale', async () => {
      await request(app.getHttpServer())
        .patch(`/document-sales/${saleId}/status`)
        .send({ status: 'COMPLETED' })
        .expect(200);
    });

    it('should NOT update COMPLETED sale header (nor items)', async () => {
      await request(app.getHttpServer())
        .patch(`/document-sales/${saleId}`)
        .send({
          notes: 'Attempt update',
        })
        .expect(400);

      const doc = await prisma.documentSale.findUnique({
        where: { id: saleId },
        include: { items: true },
      });
      const itemId = doc?.items[0].id;

      await request(app.getHttpServer())
        .patch(`/document-sales/${saleId}/items/${itemId}`)
        .send({ quantity: 5, price: 100 })
        .expect(400);
    });

    it('should revert sale to DRAFT', async () => {
      await request(app.getHttpServer())
        .patch(`/document-sales/${saleId}/status`)
        .send({ status: 'DRAFT' })
        .expect(200);
    });

    it('should NOT delete DRAFT sale (endpoint removed)', async () => {
      await request(app.getHttpServer()).delete(`/document-sales/${saleId}`).expect(404);
    });
  });

  describe('Document Return CRUD', () => {
    let storeId: string;
    let clientId: string;
    let productId: string;
    let returnId: string;

    beforeAll(async () => {
      storeId = (await helper.createStore()).id;
      clientId = (await helper.createClient()).id;
      const category = await helper.createCategory();
      productId = (await helper.createProduct(category.id)).id;
      // Initial stock to revert return safely later
      await helper.addStock(storeId, productId, 100, 50);
    });

    it('should create a DRAFT return', async () => {
      const res = await request(app.getHttpServer())
        .post('/document-returns')
        .send({
          storeId,
          clientId,
          date: new Date(),
          status: 'DRAFT',
        })
        .expect(201);

      returnId = res.body.id;
      expect(res.body.status).toBe('DRAFT');
      expect(res.body.code).toBeDefined();

      // Add item
      const itemRes = await request(app.getHttpServer())
        .post(`/document-returns/${returnId}/items`)
        .send({ items: [{ productId, quantity: 2, price: 50 }] })
        .expect(201);

      expect(itemRes.body.items).toHaveLength(1);
      helper.createdIds.returns.push(returnId);
    });

    it('should update DRAFT return item', async () => {
      const docBefore = await prisma.documentReturn.findUnique({
        where: { id: returnId },
        include: { items: true },
      });
      const itemId = docBefore?.items[0].id;

      const res = await request(app.getHttpServer())
        .patch(`/document-returns/${returnId}/items/${itemId}`)
        .send({ quantity: 5, price: 50 })
        .expect(200);

      expect(res.body.items[0].quantity).toBe('5');
    });

    it('should complete return', async () => {
      await request(app.getHttpServer())
        .patch(`/document-returns/${returnId}/status`)
        .send({ status: 'COMPLETED' })
        .expect(200);
    });

    it('should NOT delete COMPLETED return (endpoint removed)', async () => {
      await request(app.getHttpServer()).delete(`/document-returns/${returnId}`).expect(404);
    });

    it('should revert return to DRAFT', async () => {
      await request(app.getHttpServer())
        .patch(`/document-returns/${returnId}/status`)
        .send({ status: 'DRAFT' })
        .expect(200);
    });

    it('should NOT delete DRAFT return (endpoint removed)', async () => {
      await request(app.getHttpServer()).delete(`/document-returns/${returnId}`).expect(404);
    });
  });
});
