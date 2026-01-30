import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyCookie from '@fastify/cookie';
import { ZodValidationPipe } from 'nestjs-zod';
import { AppModule } from '../../../src/app.module';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { TestHelper } from '../helpers/test-helper';
import request from 'supertest';

describe('Price Logic (Slice Last)', () => {
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

  it('should maintain current price from the latest document even if older document is edited', async () => {
    const category = await helper.createCategory();
    const product = await helper.createProduct(category.id);
    const { retail } = await helper.createPriceTypes();

    const dateOld = new Date('2024-01-01T10:00:00Z');
    const dateNew = new Date('2024-02-01T10:00:00Z');

    // 1. Create OLD Price Change (Jan 1st) - Price 100
    const createPayloadOld = {
      date: dateOld.toISOString(),
      status: 'DRAFT',
      items: [
        {
          productId: product.id,
          priceTypeId: retail.id,
          newValue: 100,
        },
      ],
    };

    const resOld = await request(app.getHttpServer())
      .post('/document-price-changes')
      .send(createPayloadOld)
      .expect(201);

    const idOld = resOld.body.id;
    helper.createdIds.priceChanges.push(idOld);

    // Complete Old
    await request(app.getHttpServer())
      .patch(`/document-price-changes/${idOld}/status`)
      .send({ status: 'COMPLETED' })
      .expect(200);

    // Verify Price is 100
    let priceCheck1 = await prisma.price.findUnique({
      where: { productId_priceTypeId: { productId: product.id, priceTypeId: retail.id } },
    });
    expect(priceCheck1?.value.toNumber()).toBe(100);

    // 2. Create NEW Price Change (Feb 1st) - Price 120
    const createPayloadNew = {
      date: dateNew.toISOString(),
      status: 'DRAFT',
      items: [
        {
          productId: product.id,
          priceTypeId: retail.id,
          newValue: 120,
        },
      ],
    };

    const resNew = await request(app.getHttpServer())
      .post('/document-price-changes')
      .send(createPayloadNew)
      .expect(201);

    const idNew = resNew.body.id;
    helper.createdIds.priceChanges.push(idNew);

    // Complete New
    await request(app.getHttpServer())
      .patch(`/document-price-changes/${idNew}/status`)
      .send({ status: 'COMPLETED' })
      .expect(200);

    // Verify Price is 120 (Updated because Feb > Jan)
    let priceCheck2 = await prisma.price.findUnique({
      where: { productId_priceTypeId: { productId: product.id, priceTypeId: retail.id } },
    });
    expect(priceCheck2?.value.toNumber()).toBe(120);

    // 3. EDIT OLD Price Change (Jan 1st) - Change Price to 150
    const updatePayload = {
      date: dateOld.toISOString(), // Keep old date
      items: [
        {
          productId: product.id,
          priceTypeId: retail.id,
          newValue: 150, // New value in old doc
        },
      ],
    };

    // Revert status to DRAFT
    await request(app.getHttpServer())
      .patch(`/document-price-changes/${idOld}/status`)
      .send({ status: 'DRAFT' })
      .expect(200);

    // Update content
    await request(app.getHttpServer())
      .patch(`/document-price-changes/${idOld}`)
      .send(updatePayload)
      .expect(200);

    // Complete again
    await request(app.getHttpServer())
      .patch(`/document-price-changes/${idOld}/status`)
      .send({ status: 'COMPLETED' })
      .expect(200);

    // 4. CHECK FINAL PRICE
    // EXPECTATION: Price should STILL be 120 (from Feb doc), NOT 150 (from Jan doc)
    let priceCheckFinal = await prisma.price.findUnique({
      where: { productId_priceTypeId: { productId: product.id, priceTypeId: retail.id } },
    });
    expect(priceCheckFinal?.value.toNumber()).toBe(120);

    // 5. Check Ledger
    const history = await prisma.priceLedger.findMany({
      where: { productId: product.id, priceTypeId: retail.id },
      orderBy: { date: 'asc' },
    });

    // Check if we have an entry with value 150 (from Jan 1st)
    // Note: Re-completing logic might duplicate ledger entries or replace them?
    // My implementation deletes linked ledger entries on Revert (to DRAFT) and recreates on Complete.
    // So there should be ONE entry for Jan 1st with value 150.

    // And one entry for Feb 1st with 120.

    const entry150 = history.find((h) => h.value.toNumber() === 150);
    expect(entry150).toBeDefined();
    expect(entry150?.date.toISOString()).toBe(dateOld.toISOString());

    const entry120 = history.find((h) => h.value.toNumber() === 120);
    expect(entry120).toBeDefined();
    expect(entry120?.date.toISOString()).toBe(dateNew.toISOString());
  });
});
