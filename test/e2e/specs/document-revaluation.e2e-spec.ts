import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyCookie from '@fastify/cookie';
import { ZodValidationPipe } from 'nestjs-zod';
import { AppModule } from '../../../src/app.module';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { TestHelper } from '../helpers/test-helper';
import request from 'supertest';

describe('Document Revaluation (e2e)', () => {
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

  it('should create a revaluation document and update prices on completion', async () => {
    const store = await helper.createStore();
    const category = await helper.createCategory();
    const product = await helper.createProduct(category.id);
    const { retail } = await helper.createPriceTypes();

    // 1. Create DRAFT
    const createPayload = {
      date: new Date().toISOString(),
      status: 'DRAFT',
      notes: 'Initial pricing',
      items: [
        {
          productId: product.id,
          priceTypeId: retail.id,
          newValue: 500,
        },
      ],
    };

    const res = await request(app.getHttpServer())
      .post('/document-revaluations')
      .send(createPayload)
      .expect(201);

    const docId = res.body.id;
    helper.createdIds.revaluations.push(docId);
    expect(res.body.status).toBe('DRAFT');

    // Verify Price NOT updated yet
    const priceBefore = await prisma.price.findUnique({
      where: { productId_priceTypeId: { productId: product.id, priceTypeId: retail.id } },
    });
    expect(priceBefore).toBeNull();

    // 2. Complete Document
    await request(app.getHttpServer())
      .patch(`/document-revaluations/${docId}/status`)
      .send({ status: 'COMPLETED' })
      .expect(200);

    // Verify Price UPDATED
    const priceAfter = await prisma.price.findUnique({
      where: { productId_priceTypeId: { productId: product.id, priceTypeId: retail.id } },
    });
    expect(priceAfter?.value.toNumber()).toBe(500);

    // Verify Ledger
    const ledger = await prisma.priceLedger.findFirst({
      where: { documentRevaluationId: docId },
    });
    expect(ledger).toBeDefined();
    expect(ledger?.value.toNumber()).toBe(500);
  });

  it('should revert prices when moved back to DRAFT', async () => {
    const store = await helper.createStore();
    const category = await helper.createCategory();
    const product = await helper.createProduct(category.id);
    const { retail } = await helper.createPriceTypes();

    // Setup: Existing price 100
    await prisma.price.create({
      data: {
        productId: product.id,
        priceTypeId: retail.id,
        value: 100,
      },
    });
    // Create base ledger entry? Not strictly needed for this test unless we want robust fallback,
    // but our service deletes if no ledger remains.
    // Let's create a base ledger entry so we have something to fall back to.
    await prisma.priceLedger.create({
      data: {
        productId: product.id,
        priceTypeId: retail.id,
        value: 100,
        date: new Date('2023-01-01'),
      },
    });

    // 1. Create and Complete Change to 200
    const createPayload = {
      date: new Date().toISOString(),
      status: 'COMPLETED',
      items: [
        {
          productId: product.id,
          priceTypeId: retail.id,
          newValue: 200,
        },
      ],
    };

    const res = await request(app.getHttpServer())
      .post('/document-revaluations')
      .send(createPayload)
      .expect(201);

    const docId = res.body.id;
    helper.createdIds.revaluations.push(docId);

    // Verify Price is 200
    const price1 = await prisma.price.findUnique({
      where: { productId_priceTypeId: { productId: product.id, priceTypeId: retail.id } },
    });
    expect(price1?.value.toNumber()).toBe(200);

    // 2. Revert to DRAFT
    await request(app.getHttpServer())
      .patch(`/document-revaluations/${docId}/status`)
      .send({ status: 'DRAFT' })
      .expect(200);

    // Verify Price reverted to 100 (based on older ledger entry)
    const price2 = await prisma.price.findUnique({
      where: { productId_priceTypeId: { productId: product.id, priceTypeId: retail.id } },
    });
    expect(price2?.value.toNumber()).toBe(100);

    // Verify Ledger for 200 STILL exists (Audit trail)
    const originalLedger = await prisma.priceLedger.findFirst({
      where: { documentRevaluationId: docId, value: 200 },
    });
    expect(originalLedger).toBeDefined();

    // Verify Reverse Ledger entry (Storno) exists
    const stornoLedger = await prisma.priceLedger.findFirst({
      where: { documentRevaluationId: docId, value: 100 },
    });
    expect(stornoLedger).toBeDefined();
  });
});
