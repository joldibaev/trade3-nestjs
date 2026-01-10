import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../../src/app.module';
import { PrismaService } from '../../../src/core/prisma/prisma.service';
import { TestHelper } from '../helpers/test-helper';

describe('Document Transfer (e2e)', () => {
  let app: INestApplication;
  let helper: TestHelper;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    const prisma = app.get(PrismaService);
    helper = new TestHelper(app, prisma);
  });

  afterAll(async () => {
    await helper.cleanup();
    await app.close();
  });

  it('should fail transfer if source stock is insufficient', async () => {
    const storeA = await helper.createStore();
    const storeB = await helper.createStore();
    const vendor = await helper.createVendor();
    const category = await helper.createCategory();
    const product = await helper.createProduct(category.id);

    // Stock: 10
    await helper.createPurchase(storeA.id, vendor.id, product.id, 10, 1000);

    // Try Transfer: 15 (Fail)
    // Try Transfer: 15 (Fail)
    const res = await helper.createTransfer(storeA.id, storeB.id, product.id, 15, 'COMPLETED', 400);
    expect(res.message).toBeDefined();

    const stockA = await helper.getStock(product.id, storeA.id);
    expect(stockA!.quantity.toString()).toBe('10');
    const stockB = await helper.getStock(product.id, storeB.id);
    expect(stockB).toBeNull();
  });

  it('should execute valid atomic transfer with WAP update', async () => {
    const storeA = await helper.createStore();
    const storeB = await helper.createStore();
    const vendor = await helper.createVendor();
    const category = await helper.createCategory();
    const product = await helper.createProduct(category.id);

    // Store A: 10 @ 1000
    await helper.createPurchase(storeA.id, vendor.id, product.id, 10, 1000);

    // Store B: 5 @ 2000 (Initial)
    await helper.createPurchase(storeB.id, vendor.id, product.id, 5, 2000);

    // Transfer 5 from A to B
    // Transfer 5 from A to B
    const transfer = await helper.createTransfer(storeA.id, storeB.id, product.id, 5, 'COMPLETED');
    // helper.createdIds.transfers.push(transfer.id); // Handled by helper

    const stockA = await helper.getStock(product.id, storeA.id);
    expect(stockA!.quantity.toString()).toBe('5');

    const stockB = await helper.getStock(product.id, storeB.id);
    expect(stockB!.quantity.toString()).toBe('10');
    // WAP = (5*2000 + 5*1000) / 10 = 1500
    expect(stockB!.averagePurchasePrice.toFixed(2)).toBe('1500.00');
  });

  it('should not update stocks if transfer is DRAFT and update when completed', async () => {
    const storeA = await helper.createStore();
    const storeB = await helper.createStore();
    const vendor = await helper.createVendor();
    const category = await helper.createCategory();
    const product = await helper.createProduct(category.id);

    // Initial source stock: 10
    await helper.createPurchase(storeA.id, vendor.id, product.id, 10, 1000);

    // 1. Create DRAFT transfer (5 from A to B)
    const transfer = await helper.createTransfer(storeA.id, storeB.id, product.id, 5, 'DRAFT');

    // Verify stocks unchanged
    const stockA_draft = await helper.getStock(product.id, storeA.id);
    expect(stockA_draft!.quantity.toString()).toBe('10');
    const stockB_draft = await helper.getStock(product.id, storeB.id);
    expect(stockB_draft).toBeNull();

    // 2. Complete transfer
    await helper.completeTransfer(transfer.id);

    // Verify stocks updated
    const stockA_after = await helper.getStock(product.id, storeA.id);
    expect(stockA_after!.quantity.toString()).toBe('5');
    const stockB_after = await helper.getStock(product.id, storeB.id);
    expect(stockB_after!.quantity.toString()).toBe('5');
  });
});
