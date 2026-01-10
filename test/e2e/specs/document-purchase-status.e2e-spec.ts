import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, BadRequestException } from '@nestjs/common';
import { AppModule } from '../../../src/app.module';
import { PrismaService } from '../../../src/core/prisma/prisma.service';
import { TestHelper } from '../helpers/test-helper';
import { DocumentPurchaseService } from '../../../src/document-purchase/document-purchase.service';
import { StoreService } from '../../../src/store/store.service';
import { CashboxService } from '../../../src/cashbox/cashbox.service';
import { VendorService } from '../../../src/vendor/vendor.service';
import { ClientService } from '../../../src/client/client.service';
import { PriceTypeService } from '../../../src/pricetype/pricetype.service';
import { ProductService } from '../../../src/product/product.service';
import { CategoryService } from '../../../src/category/category.service';
import { DocumentSaleService } from '../../../src/document-sale/document-sale.service';
import { DocumentReturnService } from '../../../src/document-return/document-return.service';
import { DocumentAdjustmentService } from '../../../src/document-adjustment/document-adjustment.service';
import { DocumentTransferService } from '../../../src/document-transfer/document-transfer.service';

describe('Document Purchase Status (e2e)', () => {
  let app: INestApplication;
  let helper: TestHelper;
  let documentPurchaseService: DocumentPurchaseService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    documentPurchaseService = app.get(DocumentPurchaseService);

    helper = new TestHelper(
      app.get(PrismaService),
      app.get(StoreService),
      app.get(CashboxService),
      app.get(VendorService),
      app.get(ClientService),
      app.get(PriceTypeService),
      app.get(ProductService),
      app.get(CategoryService),
      documentPurchaseService,
      app.get(DocumentSaleService),
      app.get(DocumentReturnService),
      app.get(DocumentAdjustmentService),
      app.get(DocumentTransferService),
    );
  });

  afterAll(async () => {
    await helper.cleanup();
    await app.close();
  });

  it('should revert stock when changing from COMPLETED to DRAFT', async () => {
    const store = await helper.createStore();
    const vendor = await helper.createVendor();
    const category = await helper.createCategory();
    const product = await helper.createProduct(category.id);

    // 1. Create Purchase (COMPLETED)
    const purchase = await documentPurchaseService.create({
      storeId: store.id,
      vendorId: vendor.id,
      date: new Date().toISOString(),
      status: 'COMPLETED',
      items: [{ productId: product.id, quantity: 10, price: 100 }],
      newPrices: [],
    });
    helper.createdIds.purchases.push(purchase.id);

    const stockBefore = await helper.getStock(product.id, store.id);
    expect(stockBefore!.quantity.toString()).toBe('10');

    // 2. Revert to DRAFT
    await documentPurchaseService.updateStatus(purchase.id, 'DRAFT');

    const stockAfter = await helper.getStock(product.id, store.id);
    // Stock should be 0 (or null if fully removed, but our logic likely keeps record with 0)
    // Actually our logic keeps the record but quantity becomes 0.
    expect(stockAfter!.quantity.toString()).toBe('0');
  });

  it('should forbid reverting if stock would become negative (e.g. after sale)', async () => {
    const store = await helper.createStore();
    const cashbox = await helper.createCashbox(store.id);
    const vendor = await helper.createVendor();
    const category = await helper.createCategory();
    const product = await helper.createProduct(category.id);
    const { retail } = await helper.createPriceTypes();

    // 1. Purchase 10 items
    const purchase = await documentPurchaseService.create({
      storeId: store.id,
      vendorId: vendor.id,
      date: new Date().toISOString(),
      status: 'COMPLETED',
      items: [{ productId: product.id, quantity: 10, price: 100 }],
      newPrices: [{ priceTypeId: retail.id, value: 200 }],
    });
    helper.createdIds.purchases.push(purchase.id);

    // 2. Sell 5 items
    await helper.createSale(store.id, cashbox.id, retail.id, product.id, 5, 200);

    // Current Stock: 5.
    // Trying to revert purchase (-10) would result in -5.

    // 3. Try to revert purchase
    await expect(documentPurchaseService.updateStatus(purchase.id, 'DRAFT')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should allow re-completing a reverted purchase', async () => {
    const store = await helper.createStore();
    const vendor = await helper.createVendor();
    const category = await helper.createCategory();
    const product = await helper.createProduct(category.id);

    // 1. Create Purchase (COMPLETED)
    const purchase = await documentPurchaseService.create({
      storeId: store.id,
      vendorId: vendor.id,
      date: new Date().toISOString(),
      status: 'COMPLETED',
      items: [{ productId: product.id, quantity: 10, price: 100 }],
    });
    helper.createdIds.purchases.push(purchase.id);

    // 2. Revert to DRAFT
    await documentPurchaseService.updateStatus(purchase.id, 'DRAFT');
    const stockZero = await helper.getStock(product.id, store.id);
    expect(stockZero!.quantity.toString()).toBe('0');

    // 3. Complete again
    await documentPurchaseService.updateStatus(purchase.id, 'COMPLETED');
    const stockFinal = await helper.getStock(product.id, store.id);
    expect(stockFinal!.quantity.toString()).toBe('10');
  });

  it('should handle cancel status same as draft (revert stock)', async () => {
    const store = await helper.createStore();
    const vendor = await helper.createVendor();
    const category = await helper.createCategory();
    const product = await helper.createProduct(category.id);

    // 1. Create Purchase (COMPLETED)
    const purchase = await documentPurchaseService.create({
      storeId: store.id,
      vendorId: vendor.id,
      date: new Date().toISOString(),
      status: 'COMPLETED',
      items: [{ productId: product.id, quantity: 5, price: 500 }],
    });
    helper.createdIds.purchases.push(purchase.id);

    // 2. Cancel
    await documentPurchaseService.updateStatus(purchase.id, 'CANCELLED');

    const stock = await helper.getStock(product.id, store.id);
    expect(stock!.quantity.toString()).toBe('0');
  });
  it('should forbid reverting if stock value (WAP) would become negative', async () => {
    const store = await helper.createStore();
    const cashbox = await helper.createCashbox(store.id);
    const vendor = await helper.createVendor();
    const category = await helper.createCategory();
    const product = await helper.createProduct(category.id);
    const { retail } = await helper.createPriceTypes();

    // 1. Buy Cheap (10 @ 10$) - WAP 10
    await helper.createPurchase(store.id, vendor.id, product.id, 10, 10);

    // 2. Buy Expensive (10 @ 100$) - Total Qty 20, Total Value 1100, WAP 55
    const expensivePurchase = await documentPurchaseService.create({
      storeId: store.id,
      vendorId: vendor.id,
      date: new Date().toISOString(),
      status: 'COMPLETED',
      items: [{ productId: product.id, quantity: 10, price: 100 }],
    });
    helper.createdIds.purchases.push(expensivePurchase.id);

    // Current Stock: 20 @ 55 (Total Value 1100)

    // 3. Sell (10 items). Cost of Goods Sold = 10 * 55 = 550.
    // Remaining Stock: 10 items. Remaining Value = 550.
    await helper.createSale(store.id, cashbox.id, retail.id, product.id, 10, 200);

    // 4. Try to revert "Expensive Purchase" (10 @ 100 = 1000 value)
    // We have 550 value in stock. We want to remove 1000 value.
    // Result would be negative value. blocked.
    await expect(
      documentPurchaseService.updateStatus(expensivePurchase.id, 'DRAFT'),
    ).rejects.toThrow(BadRequestException);
  });
});
