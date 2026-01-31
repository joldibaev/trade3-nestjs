import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyCookie from '@fastify/cookie';
import { ZodValidationPipe } from 'nestjs-zod';
import { AppModule } from '../../../src/app.module';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { TestHelper } from '../helpers/test-helper';
import request from 'supertest';

describe('Document Purchase Price Integration (e2e)', () => {
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

  it('should automatically create DocumentRevaluation when purchase has newPrices', async () => {
    const store = await helper.createStore();
    const vendor = await helper.createVendor();
    const category = await helper.createCategory();
    const product = await helper.createProduct(category.id);
    const { retail, wholesale } = await helper.createPriceTypes();

    const newPrices = [
      { priceTypeId: retail.id, value: 15000 },
      { priceTypeId: wholesale.id, value: 12000 },
    ];

    // Create purchase with multiple new prices for one product
    const purchase = await helper.createPurchase(
      store.id,
      vendor.id,
      product.id,
      10,
      10000,
      'DRAFT',
      newPrices,
    );

    // Verify DocumentRevaluation was created
    const revaluation = await prisma.documentRevaluation.findFirst({
      where: { documentPurchaseId: purchase.id },
      include: { items: true },
    });

    expect(revaluation).toBeDefined();
    expect(revaluation?.items).toHaveLength(2);

    const retailItem = revaluation?.items.find((i) => i.priceTypeId === retail.id);
    const wholesaleItem = revaluation?.items.find((i) => i.priceTypeId === wholesale.id);

    expect(retailItem?.newValue.toNumber()).toBe(15000);
    expect(wholesaleItem?.newValue.toNumber()).toBe(12000);
    expect(revaluation?.status).toBe('DRAFT');
  });

  it('should create DocumentRevaluation from multiple products in one purchase', async () => {
    const store = await helper.createStore();
    const vendor = await helper.createVendor();
    const category = await helper.createCategory();
    const product1 = await helper.createProduct(category.id);
    const product2 = await helper.createProduct(category.id);
    const { retail } = await helper.createPriceTypes();

    const date = new Date().toISOString();

    // Create purchase with two products, each having a new price
    const res = await request(app.getHttpServer())
      .post('/document-purchases')
      .send({ storeId: store.id, vendorId: vendor.id, date })
      .expect(201);

    const purchaseId = res.body.id;
    helper.createdIds.purchases.push(purchaseId);

    // Add first product with new price
    await request(app.getHttpServer())
      .post(`/document-purchases/${purchaseId}/items`)
      .send({
        items: [
          {
            productId: product1.id,
            quantity: 5,
            price: 100,
            newPrices: [{ priceTypeId: retail.id, value: 150 }],
          },
        ],
      })
      .expect(201);

    // Add second product with new price
    await request(app.getHttpServer())
      .post(`/document-purchases/${purchaseId}/items`)
      .send({
        items: [
          {
            productId: product2.id,
            quantity: 10,
            price: 200,
            newPrices: [{ priceTypeId: retail.id, value: 300 }],
          },
        ],
      })
      .expect(201);

    // Verify one DocumentRevaluation with two items
    const revaluation = await prisma.documentRevaluation.findFirst({
      where: { documentPurchaseId: purchaseId },
      include: { items: true },
    });

    expect(revaluation).toBeDefined();
    expect(revaluation?.items).toHaveLength(3);
    expect(
      revaluation?.items.some((i) => i.productId === product1.id && i.newValue.toNumber() === 150),
    ).toBe(true);
    expect(
      revaluation?.items.some((i) => i.productId === product2.id && i.newValue.toNumber() === 300),
    ).toBe(true);
  });
});
