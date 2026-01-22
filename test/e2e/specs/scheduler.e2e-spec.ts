import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../../src/app.module';
import { PrismaService } from '../../../src/core/prisma/prisma.service';
import { TestHelper } from '../helpers/test-helper';
import { SchedulerService } from '../../../src/core/scheduler/scheduler.service';

describe('Scheduler & Future Documents (e2e)', () => {
  let app: INestApplication;
  let helper: TestHelper;
  let schedulerService: SchedulerService;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    schedulerService = app.get(SchedulerService);
    helper = new TestHelper(app, prisma);
  });

  afterAll(async () => {
    await helper.cleanup();
    await app.close();
  });

  it('should auto-schedule future Purchase and complete it when time arrives', async () => {
    const store = await helper.createStore();
    const vendor = await helper.createVendor();
    const category = await helper.createCategory();
    const product = await helper.createProduct(category.id);

    // 1. Create Purchase in Future (e.g. 5 seconds from now)
    const futureDate = new Date();
    futureDate.setSeconds(futureDate.getSeconds() + 5);

    const purchase = await helper.createPurchase(
      store.id,
      vendor.id,
      product.id,
      10,
      1000,
      'COMPLETED', // status
      undefined, // newPrices
      201, // expectedStatus
      futureDate, // customDate
    );

    // 2. Verify Status is SCHEDULED (not COMPLETED)
    expect(purchase.status).toBe('SCHEDULED');

    // 3. Verify Stock is NOT updated
    const stockBefore = await helper.getStock(product.id, store.id);
    expect(stockBefore).toBeNull(); // No stock yet

    // 4. Wait for time to pass (fake waiter - we just trigger scheduler manually, but let's wait a bit to be safe or just proceed?)
    // Actually, force the date check logic?
    // The Scheduler checks `date <= now`.
    // If we set date to +60s, we must wait +60s in real time OR mock the date.
    // Waiting 60s in test is too long.
    // Better approach: Create it +5s, wait 6s.

    // Let's revert to +3s but ensure we wait 4s.

    // ... WAIT. If the previous test failed with "Received: COMPLETED", it means it WAS NOT scheduled.
    // It means `docDate > new Date()` returned FALSE.
    // This implies `date` sent was NOT in the future relative to server time.
    // Or `validateDate` or assignment logic is wrong.

    // I will revert to +5 seconds and wait 6 seconds. 60 seconds is too slow for tests.
    await new Promise((resolve) => setTimeout(resolve, 6000));

    // 5. Run Scheduler manually
    await schedulerService.handleScheduledDocuments();

    // 6. Verify Status is COMPLETED
    const updatedPurchase = await prisma.documentPurchase.findUniqueOrThrow({
      where: { id: purchase.id },
    });
    expect(updatedPurchase.status).toBe('COMPLETED');

    // 7. Verify Stock IS updated
    const stockAfter = await helper.getStock(product.id, store.id);
    expect(stockAfter).not.toBeNull();
    expect(stockAfter!.quantity.toString()).toBe('10');
  }, 20000);

  it('should auto-schedule future Sale and complete it when time arrives', async () => {
    const store = await helper.createStore();
    const client = await helper.createClient();
    const category = await helper.createCategory();
    const product = await helper.createProduct(category.id);

    // Seed stock first
    await helper.createPurchase(store.id, null, product.id, 20, 100, 'COMPLETED');

    // 1. Create Sale in Future
    const futureDate = new Date();
    futureDate.setSeconds(futureDate.getSeconds() + 5);

    const sale = await helper.createSale(
      store.id,
      null as any, // cashboxId
      null as any, // priceTypeId
      product.id,
      5,
      200,
      client.id,
      'COMPLETED',
      201,
      futureDate,
    );

    expect(sale.status).toBe('SCHEDULED');

    // Stock should still be 20
    const stock1 = await helper.getStock(product.id, store.id);
    expect(stock1!.quantity.toString()).toBe('20');

    // Wait
    await new Promise((resolve) => setTimeout(resolve, 6000));

    // Run Scheduler
    await schedulerService.handleScheduledDocuments();

    // Check status
    const updatedSale = await prisma.documentSale.findUniqueOrThrow({ where: { id: sale.id } });
    expect(updatedSale.status).toBe('COMPLETED');

    // Stock should be 15
    const stock2 = await helper.getStock(product.id, store.id);
    expect(stock2!.quantity.toString()).toBe('15');
  }, 20000);
});
