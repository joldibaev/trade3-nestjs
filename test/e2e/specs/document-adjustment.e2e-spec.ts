import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyCookie from '@fastify/cookie';
import { ZodValidationPipe } from 'nestjs-zod';
import { AppModule } from '../../../src/app.module';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { TestHelper } from '../helpers/test-helper';

describe('Document Adjustment (e2e)', () => {
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

  it('should handle inventory adjustment - shortage', async () => {
    const store = await helper.createStore();
    const vendor = await helper.createVendor();
    const category = await helper.createCategory();
    const product = await helper.createProduct(category.id);

    // Initial: 10
    await helper.createPurchase(store.id, vendor.id, product.id, 10, 1000);

    // Adjustment: -2 (Shortage)
    const adj = await helper.createAdjustment(store.id, product.id, -2, 'COMPLETED');

    const stock = await helper.getStock(product.id, store.id);
    expect(stock!.quantity.toString()).toBe('8');
  });

  it('should handle inventory adjustment - surplus', async () => {
    const store = await helper.createStore();
    const vendor = await helper.createVendor();
    const category = await helper.createCategory();
    const product = await helper.createProduct(category.id);

    // Initial: 10
    await helper.createPurchase(store.id, vendor.id, product.id, 10, 1000);

    // Adjustment: +5 (Surplus)
    const adj = await helper.createAdjustment(store.id, product.id, 5, 'COMPLETED');

    const stock = await helper.getStock(product.id, store.id);
    expect(stock!.quantity.toString()).toBe('15');
  });

  it('should handle write-off of damaged goods', async () => {
    // Similarly acts as shortage
    const store = await helper.createStore();
    const vendor = await helper.createVendor();
    const category = await helper.createCategory();
    const product = await helper.createProduct(category.id);

    await helper.createPurchase(store.id, vendor.id, product.id, 10, 1000);

    const adj = await helper.createAdjustment(store.id, product.id, -10, 'COMPLETED');
    helper.createdIds.adjustments.push(adj.id);

    const stock = await helper.getStock(product.id, store.id);
    expect(stock!.quantity.toString()).toBe('0');
  });

  it('should not update stock if adjustment is DRAFT and update when completed', async () => {
    const store = await helper.createStore();
    const category = await helper.createCategory();
    const product = await helper.createProduct(category.id);

    // Initial stock: 10 via Helper
    await helper.addStock(store.id, product.id, 10, 1000);

    // 1. Create DRAFT adjustment (+5)
    const adj = await helper.createAdjustment(store.id, product.id, 5, 'DRAFT');

    // Verify stock still 10
    const stockDraft = await helper.getStock(product.id, store.id);
    expect(stockDraft!.quantity.toString()).toBe('10');

    // 2. Complete adjustment
    await helper.completeAdjustment(adj.id);

    // Verify stock updated to 15
    const stockAfter = await helper.getStock(product.id, store.id);
    expect(stockAfter!.quantity.toString()).toBe('15');

    // Verify snapshots in DocumentAdjustmentItem were updated
    const adjItem = await prisma.documentAdjustmentItem.findFirst({
      where: { adjustmentId: adj.id },
    });
    expect(adjItem!.quantityBefore.toString()).toBe('10');
    expect(adjItem!.quantityAfter.toString()).toBe('15');
  });
});
