import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyCookie from '@fastify/cookie';
import { ZodValidationPipe } from 'nestjs-zod';
import { AppModule } from '../../../src/app.module';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { TestHelper } from '../helpers/test-helper';

describe('Document Status & Concurrency (e2e)', () => {
  let app: NestFastifyApplication;
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

    const prisma = app.get(PrismaService);
    helper = new TestHelper(app, prisma);
  });

  afterAll(async () => {
    await helper?.cleanup();
    await app.close();
  });

  describe('Document Status Handling', () => {
    it('should NOT update stock for DRAFT purchase', async () => {
      const store = await helper.createStore();
      const vendor = await helper.createVendor();
      const category = await helper.createCategory();
      const product = await helper.createProduct(category.id);

      const draftPurchase = await helper.createPurchase(
        store.id,
        vendor.id,
        product.id,
        50,
        1000,
        'DRAFT',
      );

      const stock = await helper.getStock(product.id, store.id);
      expect(stock).toBeNull();
      expect(draftPurchase.status).toBe('DRAFT');
    });

    it('should NOT update stock for DRAFT sale', async () => {
      const store = await helper.createStore();
      const cashbox = await helper.createCashbox(store.id);
      const vendor = await helper.createVendor();
      const category = await helper.createCategory();
      const product = await helper.createProduct(category.id);
      const { retail } = await helper.createPriceTypes();

      await helper.createPurchase(store.id, vendor.id, product.id, 50, 1200);

      const draftSale = await helper.createSale(
        store.id,
        cashbox.id,
        retail.id,
        product.id,
        20,
        1800,
        undefined,
        'DRAFT',
      );

      // Stock should stay same as after purchase
      const stock = await helper.getStock(product.id, store.id);
      expect(stock!.quantity.toString()).toBe('50');
      expect(draftSale.status).toBe('DRAFT');
    });
  });

  describe('Concurrency Tests', () => {
    it('should handle concurrent sales correctly with transaction locks', async () => {
      const store = await helper.createStore();
      const cashbox = await helper.createCashbox(store.id);
      const vendor = await helper.createVendor();
      const category = await helper.createCategory();
      const product = await helper.createProduct(category.id);
      const { retail } = await helper.createPriceTypes();

      // Setup initial stock: 100
      await helper.createPurchase(store.id, vendor.id, product.id, 100, 5000);

      // 10 concurrent sales of 1 item
      const salePromises = Array.from({ length: 10 }).map(() =>
        helper.createSale(store.id, cashbox.id, retail.id, product.id, 1, 7000),
      );

      const results = await Promise.allSettled(salePromises);
      const successCount = results.filter((r) => r.status === 'fulfilled').length;

      const finalStock = await helper.getStock(product.id, store.id);
      expect(finalStock).toBeDefined();
      expect(parseFloat(finalStock!.quantity.toString())).toBe(100 - successCount);
    });
  });
});
