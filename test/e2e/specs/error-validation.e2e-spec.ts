import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../../src/app.module';
import { PrismaService } from '../../../src/core/prisma/prisma.service';
import { TestHelper } from '../helpers/test-helper';

describe('Detailed Error Validation (e2e)', () => {
  let app: INestApplication;
  let helper: TestHelper;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    helper = new TestHelper(app, app.get(PrismaService));
  });

  afterAll(async () => {
    await helper.cleanup();
    await app.close();
  });

  it('should return specific error message when stock becomes negative on revert', async () => {
    const store = await helper.createStore();
    const vendor = await helper.createVendor();
    const cashbox = await helper.createCashbox(store.id);
    const category = await helper.createCategory();
    const product = await helper.createProduct(category.id);
    const { retail } = await helper.createPriceTypes();

    const purchase = await helper.createPurchase(store.id, vendor.id, product.id, 10, 100);
    await helper.createSale(store.id, cashbox.id, retail.id, product.id, 5, 200);

    const res = await helper.completePurchase(purchase.id, 'DRAFT', 400);

    expect(res.message).toContain('Недостаточно остатка товара');
    expect(res.message).toContain('доступно: 5');
    expect(res.message).toContain('требуется: 10');
  });

  it('should return specific error message when WAP becomes negative on revert', async () => {
    const store = await helper.createStore();
    const vendor = await helper.createVendor();
    const cashbox = await helper.createCashbox(store.id);
    const category = await helper.createCategory();
    const product = await helper.createProduct(category.id);
    const { retail } = await helper.createPriceTypes();

    // Buy 10 @ 10 (Total Value 100)
    await helper.createPurchase(store.id, vendor.id, product.id, 10, 10);

    // Buy 10 @ 100 (Total Value 1100, WAP 55)
    const expensivePurchase = await helper.createPurchase(store.id, vendor.id, product.id, 10, 100);

    // Sell 10 @ 200 (COGS = 10 * 55 = 550). Remaining stock 10, value 550.
    await helper.createSale(store.id, cashbox.id, retail.id, product.id, 10, 200);

    // Try to revert expensive purchase (Removing 10 @ 100 = 1000 value).
    // Available value 550. Result -450. Blocked.
    const res = await helper.completePurchase(expensivePurchase.id, 'DRAFT', 400);

    expect(res.message).toBe(
      `Нельзя отменить операцию для товара ${product.id}: остаточная стоимость станет отрицательной.`,
    );
  });
});
