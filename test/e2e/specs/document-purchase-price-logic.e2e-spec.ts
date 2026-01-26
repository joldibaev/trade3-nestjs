import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../../src/app.module';
import { PrismaService } from '../../../src/core/prisma/prisma.service';
import { TestHelper } from '../helpers/test-helper';
import request from 'supertest';

describe('Document Purchase Price Integration (e2e)', () => {
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

  it('should automatically create DocumentPriceChange when purchase has newPrices', async () => {
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

    // Verify DocumentPriceChange was created
    const priceChange = await prisma.documentPriceChange.findFirst({
      where: { documentPurchaseId: purchase.id },
      include: { items: true },
    });

    expect(priceChange).toBeDefined();
    expect(priceChange?.items).toHaveLength(2);

    const retailItem = priceChange?.items.find((i) => i.priceTypeId === retail.id);
    const wholesaleItem = priceChange?.items.find((i) => i.priceTypeId === wholesale.id);

    expect(retailItem?.newValue.toNumber()).toBe(15000);
    expect(wholesaleItem?.newValue.toNumber()).toBe(12000);
    expect(priceChange?.status).toBe('DRAFT');
  });

  it('should create DocumentPriceChange from multiple products in one purchase', async () => {
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
        productId: product1.id,
        quantity: 5,
        price: 100,
        newPrices: [{ priceTypeId: retail.id, value: 150 }],
      })
      .expect(201);

    // Add second product with new price
    await request(app.getHttpServer())
      .post(`/document-purchases/${purchaseId}/items`)
      .send({
        productId: product2.id,
        quantity: 10,
        price: 200,
        newPrices: [{ priceTypeId: retail.id, value: 300 }],
      })
      .expect(201);

    // Verify one DocumentPriceChange with two items
    const priceChange = await prisma.documentPriceChange.findFirst({
      where: { documentPurchaseId: purchaseId },
      include: { items: true },
    });

    expect(priceChange).toBeDefined();
    expect(priceChange?.items).toHaveLength(2);
    expect(
      priceChange?.items.some((i) => i.productId === product1.id && i.newValue.toNumber() === 150),
    ).toBe(true);
    expect(
      priceChange?.items.some((i) => i.productId === product2.id && i.newValue.toNumber() === 300),
    ).toBe(true);
  });
});
