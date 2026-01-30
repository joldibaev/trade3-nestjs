import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyCookie from '@fastify/cookie';
import { ZodValidationPipe } from 'nestjs-zod';
import { AppModule } from '../../../src/app.module';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { TestHelper } from '../helpers/test-helper';
import { Prisma } from '../../../src/generated/prisma/client';
import Decimal = Prisma.Decimal;

describe('Sequence Reprocessing (E2E)', () => {
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

    prisma = app.get(PrismaService);
    helper = new TestHelper(app, prisma);
  });

  afterAll(async () => {
    await helper?.cleanup();
    await app.close();
  });

  it('should recalculate Sale Cost Price when a historical Purchase is cancelled', async () => {
    // 1. Setup Master Data
    const store = await helper.createStore();
    const cashbox = await helper.createCashbox(store.id);
    const category = await helper.createCategory();
    const product = await helper.createProduct(category.id);
    const vendor = await helper.createVendor();
    const { retail } = await helper.createPriceTypes();

    // 2. Purchase A: 10 items @ 100
    // WAP = 100
    const purchaseA = await helper.createPurchase(
      store.id,
      vendor.id,
      product.id,
      10,
      100,
      'COMPLETED',
    );

    // 3. Purchase B: 10 items @ 200
    // Qty = 20. Value = 1000 + 2000 = 3000. WAP = 150.
    const purchaseB = await helper.createPurchase(
      store.id,
      vendor.id,
      product.id,
      10,
      200,
      'COMPLETED',
    );

    // Verify initial WAP
    let stock = await helper.getStock(product.id, store.id);
    expect(stock.averagePurchasePrice).toEqual(new Decimal(150));

    // 4. Sale: 1 item.
    // Should lock in Cost Price = 150.
    const sale = await helper.createSale(
      store.id,
      cashbox.id,
      retail.id,
      product.id,
      1,
      300, // Sell Price
    );

    // Check Sale Item Cost Price
    let saleItem = await prisma.documentSaleItem.findFirstOrThrow({
      where: { saleId: sale.id },
    });
    expect(saleItem.costPrice).toEqual(new Decimal(150));

    // 5. Action: Cancel Purchase A (10 @ 100).
    // This removes the cheap items.
    // Remaining history: Purchase B (10 @ 200).
    // WAP should become 200.
    // Sale Cost Price should update to 200.
    await helper.completePurchase(purchaseA.id, 'CANCELLED');

    // 6. Verification

    // Check Stock: Qty should be 10 + 10 - 10 (cancelled) - 1 (sold) = 9.
    // WAP should be 200.
    stock = await helper.getStock(product.id, store.id);
    expect(stock.quantity).toEqual(new Decimal(9));
    expect(stock.averagePurchasePrice).toEqual(new Decimal(200));

    // Check Historical Sale Cost Price (The Sequence Reprocessing magic)
    saleItem = await prisma.documentSaleItem.findFirstOrThrow({
      where: { saleId: sale.id },
    });
    expect(saleItem.costPrice).toEqual(new Decimal(200));
  });
});
