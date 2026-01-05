import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
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

describe('Document Adjustment (e2e)', () => {
  let app: INestApplication;
  let helper: TestHelper;
  let documentAdjustmentService: DocumentAdjustmentService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    documentAdjustmentService = app.get(DocumentAdjustmentService);

    helper = new TestHelper(
      app.get(PrismaService),
      app.get(StoreService),
      app.get(CashboxService),
      app.get(VendorService),
      app.get(ClientService),
      app.get(PriceTypeService),
      app.get(ProductService),
      app.get(CategoryService),
      app.get(DocumentPurchaseService),
      app.get(DocumentSaleService),
      app.get(DocumentReturnService),
      documentAdjustmentService,
      app.get(DocumentTransferService),
    );
  });

  afterAll(async () => {
    await helper.cleanup();
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
    const adj = await documentAdjustmentService.create({
      storeId: store.id,
      date: new Date().toISOString(),
      status: 'COMPLETED',
      items: [{ productId: product.id, quantity: -2 }],
    });
    helper.createdIds.adjustments.push(adj.id);

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
    const adj = await documentAdjustmentService.create({
      storeId: store.id,
      date: new Date().toISOString(),
      status: 'COMPLETED',
      items: [{ productId: product.id, quantity: 5 }],
    });
    helper.createdIds.adjustments.push(adj.id);

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

    const adj = await documentAdjustmentService.create({
      storeId: store.id,
      date: new Date().toISOString(),
      status: 'COMPLETED',
      items: [{ productId: product.id, quantity: -10 }],
    });
    helper.createdIds.adjustments.push(adj.id);

    const stock = await helper.getStock(product.id, store.id);
    expect(stock!.quantity.toString()).toBe('0');
  });
});
