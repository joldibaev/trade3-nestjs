import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../../src/app.module';
import { PrismaService } from '../../../src/core/prisma/prisma.service';
import { TestHelper } from '../helpers/test-helper';

describe('Stock Movement Enhancements (e2e)', () => {
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

    it('should log extended fields for Purchase', async () => {
        const store = await helper.createStore();
        const vendor = await helper.createVendor();
        const category = await helper.createCategory();
        const product = await helper.createProduct(category.id);

        // Initial Purchase
        const purchase = await helper.createPurchase(store.id, vendor.id, product.id, 10, 100);
        // Total = 1000

        const movement = await prisma.stockMovement.findFirst({
            where: { documentPurchaseId: purchase.id },
        });

        expect(movement).toBeDefined();
        expect(movement.type).toBe('PURCHASE');
        expect(movement.quantity.toString()).toBe('10'); // Delta
        expect(movement.quantityBefore.toString()).toBe('0'); // Was 0
        expect(movement.quantityAfter.toString()).toBe('10'); // Became 10
        expect(movement.batchId).toBe(purchase.id); // Batch ID
        // Transaction Amount: 10 * 100 = 1000
        expect(movement.transactionAmount.toString()).toBe('1000');
    });

    it('should log extended fields for Sale', async () => {
        const store = await helper.createStore();
        const vendor = await helper.createVendor();
        const category = await helper.createCategory();
        const product = await helper.createProduct(category.id);

        // 1. Purchase: 10 @ 100. WAP = 100.
        await helper.createPurchase(store.id, vendor.id, product.id, 10, 100);

        // Prepare Sale Entities
        const cashbox = await helper.createCashbox(store.id);
        const { retail } = await helper.createPriceTypes();

        // 2. Sale: 5 @ 200 (Price). Cost is 100.
        // Signature: createSale(storeId, cashboxId, priceTypeId, productId, quantity, price)
        const sale = await helper.createSale(store.id, cashbox.id, retail.id, product.id, 5, 200);

        const movement = await prisma.stockMovement.findFirst({
            where: { documentSaleId: sale.id },
        });

        expect(movement).toBeDefined();
        expect(movement.type).toBe('SALE');
        expect(movement.quantity.toString()).toBe('-5'); // Delta
        expect(movement.quantityBefore.toString()).toBe('10'); // Was 10
        expect(movement.quantityAfter.toString()).toBe('5'); // Became 5
        expect(movement.batchId).toBe(sale.id);

        // Transaction Amount (Cost of Goods Sold): -5 * 100 = -500
        // Note: implementation negated it.
        expect(movement.transactionAmount.toString()).toBe('-500');
    });
});
