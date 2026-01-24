import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../../src/app.module';
import { PrismaService } from '../../../src/core/prisma/prisma.service';
import { TestHelper } from '../helpers/test-helper';
import { Prisma } from '../../../src/generated/prisma/client';
import Decimal = Prisma.Decimal;

describe('Complex Inventory Scenarios (e2e)', () => {
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

  it('should handle documents with multiple products and update all correctly', async () => {
    const store = await helper.createStore();
    const vendor = await helper.createVendor();
    const category = await helper.createCategory();
    const p1 = await helper.createProduct(category.id);
    const p2 = await helper.createProduct(category.id);

    // 1. Create Purchase with 2 items
    const purchase = await helper.createPurchase(store.id, vendor.id, p1.id, 10, 100, 'DRAFT');

    // Add second item via patch
    await helper.updatePurchase(purchase.id, {
      items: [
        { productId: p1.id, quantity: 10, price: 100 },
        { productId: p2.id, quantity: 20, price: 200 },
      ],
    });

    // 2. Complete
    await helper.completePurchase(purchase.id, 'COMPLETED');

    // 3. Verify stocks
    const s1 = await helper.getStock(p1.id, store.id);
    const s2 = await helper.getStock(p2.id, store.id);
    expect(s1!.quantity).toEqual(new Decimal(10));
    expect(s2!.quantity).toEqual(new Decimal(20));
  });

  it('should recalculate entire history chain when a middle purchase price is updated', async () => {
    const store = await helper.createStore();
    const vendor = await helper.createVendor();
    const category = await helper.createCategory();
    const product = await helper.createProduct(category.id);
    const cashbox = await helper.createCashbox(store.id);
    const { retail } = await helper.createPriceTypes();

    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    twoDaysAgo.setHours(0, 0, 0, 0);

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    // T1: Purchase 10 @ 100. WAP 100.
    const p1 = await helper.createPurchase(
      store.id,
      vendor.id,
      product.id,
      10,
      100,
      'COMPLETED',
      [],
      201,
      twoDaysAgo,
    );

    // T2: Sale 5. CostPrice 100.
    const sale1 = await helper.createSale(
      store.id,
      cashbox.id,
      retail.id,
      product.id,
      5,
      200,
      undefined,
      'COMPLETED',
      201,
      yesterday,
    );

    // T3: Purchase 10 @ 200. Current Stock: 15. Total Value: 500 + 2000 = 2500. WAP 166.666...
    // Use today's date (default)
    await helper.createPurchase(store.id, vendor.id, product.id, 10, 200);

    // T4: Sale 5. CostPrice 166.666...
    const sale2 = await helper.createSale(store.id, cashbox.id, retail.id, product.id, 5, 300);

    // ACTION: Change P1 price to 150.
    // T1: Purchase 10 @ 150. WAP 150.
    // T2: Sale 5. New CostPrice 150. Remaining Value: 750.
    // T3: Purchase 10 @ 200. Total Value: 750 + 2000 = 2750. New WAP: 2750 / 15 = 183.333...
    // T4: Sale 5. New CostPrice 183.333...

    await helper.completePurchase(p1.id, 'DRAFT');
    await helper.updatePurchase(p1.id, {
      items: [{ productId: product.id, quantity: 10, price: 150 }],
    });
    await helper.completePurchase(p1.id, 'COMPLETED');

    // Verify Sale 1
    const si1 = await prisma.documentSaleItem.findFirstOrThrow({ where: { saleId: sale1.id } });
    expect(si1.costPrice).toEqual(new Decimal(150));

    // Verify Sale 2
    const si2 = await prisma.documentSaleItem.findFirstOrThrow({ where: { saleId: sale2.id } });
    expect(si2.costPrice).toEqual(new Decimal('183.33'));
  });

  it('should log detailed changes in DocumentLedger for status updates', async () => {
    const store = await helper.createStore();
    const vendor = await helper.createVendor();
    const category = await helper.createCategory();
    const product = await helper.createProduct(category.id);

    const purchase = await helper.createPurchase(store.id, vendor.id, product.id, 10, 100, 'DRAFT');

    await helper.completePurchase(purchase.id, 'COMPLETED');

    const ledger = await helper.getLatestDocumentLedger(purchase.id);
    expect(ledger).toBeDefined();
    expect(ledger?.action).toBe('STATUS_CHANGED');
    expect((ledger?.details as any).to).toBe('COMPLETED');
  });
});
