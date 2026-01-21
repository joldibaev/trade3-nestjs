import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../../src/app.module';
import { PrismaService } from '../../../src/core/prisma/prisma.service';
import { TestHelper } from '../helpers/test-helper';
import request from 'supertest';

describe('Price Logic (Slice Last)', () => {
  let app: INestApplication;
  let helper: TestHelper;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    helper = new TestHelper(app, prisma);
  });

  afterAll(async () => {
    await helper.cleanup();
    await app.close();
  });

  it('should maintain current price from the latest document even if older document is edited', async () => {
    const store = await helper.createStore();
    const vendor = await helper.createVendor();
    const category = await helper.createCategory();
    const product = await helper.createProduct(category.id);
    const { retail } = await helper.createPriceTypes();

    const dateOld = new Date('2024-01-01T10:00:00Z');
    const dateNew = new Date('2024-02-01T10:00:00Z');

    // 1. Create OLD Purchase (Jan 1st) - Price 100
    // We do this by DRAFT then COMPLETED to simulate normal flow,
    // but we need to ensure DATE is respected.
    const createPayloadOld = {
      storeId: store.id,
      vendorId: vendor.id,
      date: dateOld.toISOString(),
      status: 'DRAFT',
      items: [
        {
          productId: product.id,
          quantity: 10,
          price: 50,
          newPrices: [{ priceTypeId: retail.id, value: 100 }],
        },
      ],
    };

    const resOld = await request(app.getHttpServer())
      .post('/document-purchases')
      .send(createPayloadOld)
      .expect(201);

    const idOld = resOld.body.id;

    // Complete Old
    await request(app.getHttpServer())
      .patch(`/document-purchases/${idOld}/status`)
      .send({ status: 'COMPLETED' })
      .expect(200);

    // Verify Price is 100
    let priceCheck1 = await prisma.price.findUnique({
      where: { productId_priceTypeId: { productId: product.id, priceTypeId: retail.id } },
    });
    expect(priceCheck1?.value.toNumber()).toBe(100);

    // 2. Create NEW Purchase (Feb 1st) - Price 120
    const createPayloadNew = {
      storeId: store.id,
      vendorId: vendor.id,
      date: dateNew.toISOString(),
      status: 'DRAFT',
      items: [
        {
          productId: product.id,
          quantity: 10,
          price: 60,
          newPrices: [{ priceTypeId: retail.id, value: 120 }],
        },
      ],
    };

    const resNew = await request(app.getHttpServer())
      .post('/document-purchases')
      .send(createPayloadNew)
      .expect(201);

    const idNew = resNew.body.id;

    // Complete New
    await request(app.getHttpServer())
      .patch(`/document-purchases/${idNew}/status`)
      .send({ status: 'COMPLETED' })
      .expect(200);

    // Verify Price is 120 (Updated because Feb > Jan)
    let priceCheck2 = await prisma.price.findUnique({
      where: { productId_priceTypeId: { productId: product.id, priceTypeId: retail.id } },
    });
    expect(priceCheck2?.value.toNumber()).toBe(120);

    // 3. EDIT OLD Purchase (Jan 1st) - Change Price to 150
    // Logic:
    // - User realizes Jan price was actually 150.
    // - But current price (Feb) is 120.
    // - Updating Jan price to 150 should NOT overwrite Feb price (120).
    const updatePayload = {
      storeId: store.id,
      vendorId: vendor.id,
      date: dateOld.toISOString(), // Keep old date
      items: [
        {
          productId: product.id,
          quantity: 10,
          price: 50,
          newPrices: [{ priceTypeId: retail.id, value: 150 }], // New value in old doc
        },
      ],
    };

    // Need to revert status to DRAFT first (as per constraints)
    await request(app.getHttpServer())
      .patch(`/document-purchases/${idOld}/status`)
      .send({ status: 'DRAFT' })
      .expect(200);

    // Update content
    await request(app.getHttpServer())
      .patch(`/document-purchases/${idOld}`)
      .send(updatePayload)
      .expect(200);

    // Complete again
    await request(app.getHttpServer())
      .patch(`/document-purchases/${idOld}/status`)
      .send({ status: 'COMPLETED' })
      .expect(200);

    // 4. CHECK FINAL PRICE
    // EXPECTATION: Price should STILL be 120 (from Feb doc), NOT 150 (from Jan doc)
    let priceCheckFinal = await prisma.price.findUnique({
      where: { productId_priceTypeId: { productId: product.id, priceTypeId: retail.id } },
    });
    expect(priceCheckFinal?.value.toNumber()).toBe(120);

    // 5. Check History
    // History should contain the 150 entry
    const history = await prisma.priceHistory.findMany({
      where: { productId: product.id, priceTypeId: retail.id },
      orderBy: { date: 'asc' },
    });
    // Expected:
    // 1. Jan 1st: 100 (First attempt)
    // 2. Feb 1st: 120
    // 3. Jan 1st: 150 (Correction)
    // Actually, create creates new history.

    // Check if we have an entry with value 150
    const entry150 = history.find((h) => h.value.toNumber() === 150);
    expect(entry150).toBeDefined();
    expect(entry150?.date.toISOString()).toBe(dateOld.toISOString());

    const entry120 = history.find((h) => h.value.toNumber() === 120);
    expect(entry120).toBeDefined();
    expect(entry120?.date.toISOString()).toBe(dateNew.toISOString());
  });
});
