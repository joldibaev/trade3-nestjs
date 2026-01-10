import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, BadRequestException } from '@nestjs/common';
import { AppModule } from '../../../src/app.module';
import { PrismaService } from '../../../src/core/prisma/prisma.service';
import { TestHelper } from '../helpers/test-helper';
import { DocumentReturnService } from '../../../src/document-return/document-return.service';
import { StoreService } from '../../../src/store/store.service';
import { CashboxService } from '../../../src/cashbox/cashbox.service';
import { VendorService } from '../../../src/vendor/vendor.service';
import { ClientService } from '../../../src/client/client.service';
import { PriceTypeService } from '../../../src/pricetype/pricetype.service';
import { ProductService } from '../../../src/product/product.service';
import { CategoryService } from '../../../src/category/category.service';
import { DocumentPurchaseService } from '../../../src/document-purchase/document-purchase.service';
import { DocumentSaleService } from '../../../src/document-sale/document-sale.service';
import { DocumentAdjustmentService } from '../../../src/document-adjustment/document-adjustment.service';
import { DocumentTransferService } from '../../../src/document-transfer/document-transfer.service';

describe('Document Return Status (e2e)', () => {
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

  it('should revert stock when changing from COMPLETED to DRAFT', async () => {
    const store = await helper.createStore();
    const client = await helper.createClient();
    const category = await helper.createCategory();
    const product = await helper.createProduct(category.id);

    // 1. Initial Stock: 0
    const stockInitial = await helper.getStock(product.id, store.id);
    expect(stockInitial).toBeNull();

    // 2. Return 5 items from client (Stock +5)
    const doc = await documentReturnService.create({
      storeId: store.id,
      clientId: client.id,
      date: new Date().toISOString(),
      status: 'COMPLETED',
      items: [{ productId: product.id, quantity: 5, price: 100 }],
    });
    helper.createdIds.returns.push(doc.id);

    const stockAfterReturn = await helper.getStock(product.id, store.id);
    expect(stockAfterReturn!.quantity.toString()).toBe('5');

    // 3. Revert Return (DRAFT) (Stock -5 -> 0)
    await documentReturnService.updateStatus(doc.id, 'DRAFT');

    const stockAfterRevert = await helper.getStock(product.id, store.id);
    expect(stockAfterRevert!.quantity.toString()).toBe('0');
  });

  it('should forbid reverting if stock is insufficient', async () => {
    const store = await helper.createStore();
    const cashbox = await helper.createCashbox(store.id);
    const client = await helper.createClient();
    const category = await helper.createCategory();
    const product = await helper.createProduct(category.id);
    const { retail } = await helper.createPriceTypes();

    // 1. Return 10 items (Stock becomes 10)
    const doc = await documentReturnService.create({
      storeId: store.id,
      clientId: client.id,
      date: new Date().toISOString(),
      status: 'COMPLETED',
      items: [{ productId: product.id, quantity: 10, price: 100 }],
    });
    helper.createdIds.returns.push(doc.id);

    // 2. Sell 8 items (Stock becomes 2)
    await helper.createSale(store.id, cashbox.id, retail.id, product.id, 8, 200);

    // 3. Try to Revert Return (Needs 10, Has 2) -> Fail
    await expect(documentReturnService.updateStatus(doc.id, 'DRAFT')).rejects.toThrow(
      BadRequestException,
    );
  });
});
