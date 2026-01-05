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

describe('Document Status & Concurrency (e2e)', () => {
  let app: INestApplication;
  let helper: TestHelper;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

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
      app.get(DocumentAdjustmentService),
      app.get(DocumentTransferService),
    );
  });

  afterAll(async () => {
    await helper.cleanup();
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

      await Promise.allSettled(salePromises);

      const finalStock = await helper.getStock(product.id, store.id);
      expect(finalStock).toBeDefined();
      expect(parseFloat(finalStock!.quantity.toString())).toBe(90); // 100 - 10
    });
  });
});
