import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { PrismaService } from '../../../src/core/prisma/prisma.service';
import { TestHelper } from '../helpers/test-helper';

describe('Document CRUD (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let helper: TestHelper;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = moduleFixture.get<PrismaService>(PrismaService);

    helper = new TestHelper(app, prisma);
    await helper.cleanup();
  });

  afterAll(async () => {
    await helper.cleanup();
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
      expect(typeof res.body.code).toBe('number');

      helper.createdIds.purchases.push(purchaseId);

      // 2. Add Items
      const updateRes = await request(app.getHttpServer())
        .patch(`/document-purchases/${purchaseId}`)
        .send({
          storeId,
          vendorId,
          date: new Date(),
          items: [{ productId, quantity: 10, price: 100 }],
        })
        .expect(200);

      expect(updateRes.body.items).toHaveLength(1);
      expect(updateRes.body.items[0].quantity).toBe('10');
    });

    it('should update DRAFT purchase', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/document-purchases/${purchaseId}`)
        .send({
          storeId,
          vendorId,
          date: new Date(),
          items: [{ productId, quantity: 20, price: 120 }],
        })
        .expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].quantity).toBe('20');
      expect(res.body.items[0].price).toBe('120');

      // Verify in DB
      const doc = await prisma.documentPurchase.findUnique({
        where: { id: purchaseId },
        include: { items: true },
      });
      expect(doc?.items[0].quantity).toEqual(expect.objectContaining({ d: [20] })); // Decimal check simplistic
    });

    it('should complete purchase', async () => {
      await request(app.getHttpServer())
        .patch(`/document-purchases/${purchaseId}/status`)
        .send({ status: 'COMPLETED' })
        .expect(200);
    });

    it('should NOT update COMPLETED purchase', async () => {
      await request(app.getHttpServer())
        .patch(`/document-purchases/${purchaseId}`)
        .send({
          storeId,
          vendorId,
          date: new Date(),
          items: [{ productId, quantity: 5, price: 50 }],
        })
        .expect(400);
    });

    it('should NOT delete COMPLETED purchase', async () => {
      await request(app.getHttpServer()).delete(`/document-purchases/${purchaseId}`).expect(400);
    });

    it('should revert purchase to DRAFT', async () => {
      await request(app.getHttpServer())
        .patch(`/document-purchases/${purchaseId}/status`)
        .send({ status: 'DRAFT' })
        .expect(200);
    });

    it('should delete DRAFT purchase', async () => {
      await request(app.getHttpServer()).delete(`/document-purchases/${purchaseId}`).expect(200);

      const doc = await prisma.documentPurchase.findUnique({ where: { id: purchaseId } });
      expect(doc).toBeNull();
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
          items: [{ productId, quantity: 5, price: 100 }],
        })
        .expect(201);

      saleId = res.body.id;
      expect(res.body.status).toBe('DRAFT');
      expect(res.body.code).toBeDefined();
      expect(typeof res.body.code).toBe('number');

      helper.createdIds.sales.push(saleId);
    });

    it('should update DRAFT sale', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/document-sales/${saleId}`)
        .send({
          storeId,
          clientId,
          cashboxId,
          date: new Date(),
          items: [{ productId, quantity: 10, price: 100 }],
        })
        .expect(200);

      expect(res.body.items[0].quantity).toBe('10');
    });

    it('should complete sale', async () => {
      await request(app.getHttpServer())
        .patch(`/document-sales/${saleId}/status`)
        .send({ status: 'COMPLETED' })
        .expect(200);
    });

    it('should NOT update COMPLETED sale', async () => {
      await request(app.getHttpServer())
        .patch(`/document-sales/${saleId}`)
        .send({
          storeId,
          clientId,
          cashboxId,
          items: [],
        })
        .expect(400);
    });

    it('should revert sale to DRAFT', async () => {
      await request(app.getHttpServer())
        .patch(`/document-sales/${saleId}/status`)
        .send({ status: 'DRAFT' })
        .expect(200);
    });

    it('should delete DRAFT sale', async () => {
      await request(app.getHttpServer()).delete(`/document-sales/${saleId}`).expect(200);

      const doc = await prisma.documentSale.findUnique({ where: { id: saleId } });
      expect(doc).toBeNull();
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
          items: [{ productId, quantity: 2, price: 50 }],
        })
        .expect(201);

      returnId = res.body.id;
      expect(res.body.status).toBe('DRAFT');
      expect(res.body.code).toBeDefined();
      expect(typeof res.body.code).toBe('number');

      helper.createdIds.returns.push(returnId);
    });

    it('should update DRAFT return', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/document-returns/${returnId}`)
        .send({
          storeId,
          clientId,
          date: new Date(),
          items: [{ productId, quantity: 5, price: 50 }],
        })
        .expect(200);

      expect(res.body.items[0].quantity).toBe('5');
    });

    it('should complete return', async () => {
      await request(app.getHttpServer())
        .patch(`/document-returns/${returnId}/status`)
        .send({ status: 'COMPLETED' })
        .expect(200);
    });

    it('should NOT delete COMPLETED return', async () => {
      await request(app.getHttpServer()).delete(`/document-returns/${returnId}`).expect(400);
    });

    it('should revert return to DRAFT', async () => {
      await request(app.getHttpServer())
        .patch(`/document-returns/${returnId}/status`)
        .send({ status: 'DRAFT' })
        .expect(200);
    });

    it('should delete DRAFT return', async () => {
      await request(app.getHttpServer()).delete(`/document-returns/${returnId}`).expect(200);

      const doc = await prisma.documentReturn.findUnique({ where: { id: returnId } });
      expect(doc).toBeNull();
    });
  });
});
