import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyCookie from '@fastify/cookie';
import { ZodValidationPipe } from 'nestjs-zod';
import { AppModule } from '../../../src/app.module';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { TestHelper } from '../helpers/test-helper';
import { Prisma } from '../../../src/generated/prisma/client';
import Decimal = Prisma.Decimal;

describe('Concurrency Stock Stress Test (e2e)', () => {
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

  it('should handle simultaneous sales and prevent overselling', async () => {
    const store = await helper.createStore();
    const cashbox = await helper.createCashbox(store.id);
    const category = await helper.createCategory();
    const product = await helper.createProduct(category.id);
    const { retail } = await helper.createPriceTypes();

    // 1. Add 5 items to stock
    await helper.addStock(store.id, product.id, 5, 100);

    // 2. Try to perform 8 sales of 1 item simultaneously
    // We use a small stagger to avoid pure burst transaction timeouts while still testing concurrency
    const saleRequests = Array.from({ length: 8 }).map(async (_, i) => {
      await new Promise((resolve) => setTimeout(resolve, i * 50));
      return helper.createSale(
        store.id,
        cashbox.id,
        retail.id,
        product.id,
        1,
        200,
        undefined,
        'COMPLETED',
      );
    });

    const results = await Promise.allSettled(saleRequests);

    const successes = results.filter((r) => r.status === 'fulfilled' && !r.value.message);
    const failures = results.filter(
      (r) => r.status === 'rejected' || (r.status === 'fulfilled' && r.value.message),
    );

    // 3. Verify exactly 5 successes and 3 failures
    expect(successes.length).toBe(5);
    expect(failures.length).toBe(3);

    // 4. Verify stock is exactly 0
    const finalStock = await helper.getStock(product.id, store.id);
    expect(finalStock!.quantity).toEqual(new Decimal(0));

    // 5. Verify Ledger entries (Audit)
    const ledgerCount = await prisma.stockLedger.count({
      where: { productId: product.id, type: 'SALE' },
    });
    expect(ledgerCount).toBe(5);
  }, 45000);
});
