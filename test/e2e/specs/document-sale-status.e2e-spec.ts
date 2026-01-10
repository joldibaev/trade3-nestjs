
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, BadRequestException } from '@nestjs/common';
import { AppModule } from '../../../src/app.module';
import { PrismaService } from '../../../src/core/prisma/prisma.service';
import { TestHelper } from '../helpers/test-helper';
import { DocumentSaleService } from '../../../src/document-sale/document-sale.service';
import { StoreService } from '../../../src/store/store.service';
import { CashboxService } from '../../../src/cashbox/cashbox.service';
import { VendorService } from '../../../src/vendor/vendor.service';
import { ClientService } from '../../../src/client/client.service';
import { PriceTypeService } from '../../../src/pricetype/pricetype.service';
import { ProductService } from '../../../src/product/product.service';
import { CategoryService } from '../../../src/category/category.service';
import { DocumentPurchaseService } from '../../../src/document-purchase/document-purchase.service';
import { DocumentReturnService } from '../../../src/document-return/document-return.service';
import { DocumentAdjustmentService } from '../../../src/document-adjustment/document-adjustment.service';
import { DocumentTransferService } from '../../../src/document-transfer/document-transfer.service';

describe('Document Sale Status (e2e)', () => {
    let app: INestApplication;
    let helper: TestHelper;
    let documentSaleService: DocumentSaleService;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

        app = moduleFixture.createNestApplication();
        await app.init();

        documentSaleService = app.get(DocumentSaleService);

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
            documentSaleService,
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
        const cashbox = await helper.createCashbox(store.id);
        const vendor = await helper.createVendor();
        const category = await helper.createCategory();
        const product = await helper.createProduct(category.id);
        const { retail } = await helper.createPriceTypes();

        // 1. Initial Stock: 10
        await helper.createPurchase(store.id, vendor.id, product.id, 10, 100);

        // 2. Sale: 5 items
        const sale = await documentSaleService.create({
            storeId: store.id,
            cashboxId: cashbox.id,
            priceTypeId: retail.id,
            date: new Date().toISOString(),
            status: 'COMPLETED',
            items: [{ productId: product.id, quantity: 5, price: 200 }],
        });
        helper.createdIds.sales.push(sale.id);

        const stockAfterSale = await helper.getStock(product.id, store.id);
        expect(stockAfterSale!.quantity.toString()).toBe('5');

        // 3. Revert Sale (DRAFT)
        await documentSaleService.updateStatus(sale.id, 'DRAFT');

        const stockAfterRevert = await helper.getStock(product.id, store.id);
        expect(stockAfterRevert!.quantity.toString()).toBe('10'); // Validates stock is returned
    });

    it('should force CANCELLED logic same as DRAFT (Stock Returned)', async () => {
        const store = await helper.createStore();
        const cashbox = await helper.createCashbox(store.id);
        const vendor = await helper.createVendor();
        const category = await helper.createCategory();
        const product = await helper.createProduct(category.id);
        const { retail } = await helper.createPriceTypes();

        // 1. Initial Stock: 10
        await helper.createPurchase(store.id, vendor.id, product.id, 10, 100);

        // 2. Sale: 5 items
        const sale = await documentSaleService.create({
            storeId: store.id,
            cashboxId: cashbox.id,
            priceTypeId: retail.id,
            date: new Date().toISOString(),
            status: 'COMPLETED',
            items: [{ productId: product.id, quantity: 5, price: 200 }],
        });
        helper.createdIds.sales.push(sale.id);

        // 3. Cancel Sale
        await documentSaleService.updateStatus(sale.id, 'CANCELLED');

        const stockAfterCancel = await helper.getStock(product.id, store.id);
        expect(stockAfterCancel!.quantity.toString()).toBe('10');
    });

    it('should be idempotent (no changes if status same)', async () => {
        const store = await helper.createStore();
        const cashbox = await helper.createCashbox(store.id);
        const vendor = await helper.createVendor();
        const category = await helper.createCategory();
        const product = await helper.createProduct(category.id);
        const { retail } = await helper.createPriceTypes();

        await helper.createPurchase(store.id, vendor.id, product.id, 10, 100);

        const sale = await documentSaleService.create({
            storeId: store.id,
            cashboxId: cashbox.id,
            priceTypeId: retail.id,
            date: new Date().toISOString(),
            status: 'COMPLETED',
            items: [{ productId: product.id, quantity: 5, price: 200 }],
        });
        helper.createdIds.sales.push(sale.id);

        // Call updateStatus to COMPLETED again
        await documentSaleService.updateStatus(sale.id, 'COMPLETED');

        const stock = await helper.getStock(product.id, store.id);
        expect(stock!.quantity.toString()).toBe('5'); // Should remain 5, not double deducted
    });
});
