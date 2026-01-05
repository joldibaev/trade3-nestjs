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

describe('Document Return (e2e)', () => {
  let app: INestApplication;
  let helper: TestHelper;
  let documentReturnService: DocumentReturnService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    documentReturnService = app.get(DocumentReturnService);

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
      documentReturnService,
      app.get(DocumentAdjustmentService),
      app.get(DocumentTransferService),
    );
  });

  afterAll(async () => {
    await helper.cleanup();
    await app.close();
  });

  it('should infer WAP from other store during return if local stock is missing', async () => {
    const storeA = await helper.createStore();
    const storeB = await helper.createStore();
    const vendor = await helper.createVendor();
    const category = await helper.createCategory();
    const product = await helper.createProduct(category.id);
    const client = await helper.createClient();

    // 1. Purchase in Store A (sets global availability of cost info)
    await helper.createPurchase(storeA.id, vendor.id, product.id, 10, 5000);

    // 2. Return in Store B (where stock is 0/missing)
    const returnDoc = await documentReturnService.create({
      storeId: storeB.id,
      clientId: client.id,
      date: new Date().toISOString(),
      status: 'COMPLETED',
      items: [{ productId: product.id, quantity: 2, price: 5000 }],
    });
    helper.createdIds.returns.push(returnDoc.id);

    // Verify Store B stock
    const stockB = await helper.getStock(product.id, storeB.id);
    expect(stockB!.quantity.toString()).toBe('2');
    expect(stockB!.averagePurchasePrice.toFixed(2)).toBe('5000.00');
  });

  it('should not update stock if return is DRAFT and update when completed', async () => {
    const store = await helper.createStore();
    const vendor = await helper.createVendor();
    const category = await helper.createCategory();
    const product = await helper.createProduct(category.id);
    const client = await helper.createClient();

    // 1. Create DRAFT return
    const returnDoc = await helper.createReturn(
      store.id,
      client.id,
      product.id,
      5,
      1000,
      'DRAFT',
    );

    // Verify stock is null/zero
    const stockDraft = await helper.getStock(product.id, store.id);
    expect(stockDraft).toBeNull();

    // 2. Complete return
    await helper.completeReturn(returnDoc.id);

    // Verify stock updated
    const stockAfter = await helper.getStock(product.id, store.id);
    expect(stockAfter!.quantity.toString()).toBe('5');
  });
});
