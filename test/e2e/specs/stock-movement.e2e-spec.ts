import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../../src/app.module';
import { PrismaService } from '../../../src/core/prisma/prisma.service';
import { TestHelper } from '../helpers/test-helper';
import { Prisma } from '../../../src/generated/prisma/client';
import Decimal = Prisma.Decimal;
import { StoreService } from '../../../src/store/store.service';
import { CashboxService } from '../../../src/cashbox/cashbox.service';
import { VendorService } from '../../../src/vendor/vendor.service';
import { ClientService } from '../../../src/client/client.service';
import { PriceTypeService } from '../../../src/pricetype/pricetype.service';
import { ProductService } from '../../../src/product/product.service';
import { CategoryService } from '../../../src/category/category.service';
import { DocumentPurchaseService } from '../../../src/document-purchase/document-purchase.service';
import { DocumentSaleService } from '../../../src/document-sale/document-sale.service';
import { DocumentReturnService } from '../../../src/document-return/document-return.service';
import { DocumentAdjustmentService } from '../../../src/document-adjustment/document-adjustment.service';
import { DocumentTransferService } from '../../../src/document-transfer/document-transfer.service';

describe('Stock Movement Audit Flow (E2E)', () => {
  let app: INestApplication;
  let prismaService: PrismaService;
  let helper: TestHelper;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prismaService = app.get<PrismaService>(PrismaService);
    helper = new TestHelper(
      prismaService,
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

  afterEach(async () => {
    await helper.cleanup();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should log StockMovement on PURCHASE with correct snapshots', async () => {
    const store = await helper.createStore();
    const vendor = await helper.createVendor();
    const category = await helper.createCategory();
    const product = await helper.createProduct(category.id);

    const qty = 10;
    const price = 100;

    const purchase = await helper.createPurchase(
      store.id,
      vendor.id,
      product.id,
      qty,
      price,
    );

    const movements = await prismaService.stockMovement.findMany({
      where: { documentPurchaseId: purchase.id },
    });

    expect(movements).toHaveLength(1);
    const mov = movements[0];
    expect(mov.type).toBe('PURCHASE');
    // Use toString() for precise comparison of Decimal values
    expect(mov.quantity.toString()).toBe(qty.toString());
    expect(mov.quantityAfter.toString()).toBe(qty.toString());
    expect(mov.averagePurchasePrice.toString()).toBe(price.toString());
    expect(mov.storeId).toBe(store.id);
    expect(mov.productId).toBe(product.id);
  });

  it('should log StockMovement on SALE with correct snapshots', async () => {
    const store = await helper.createStore();
    const vendor = await helper.createVendor();
    const category = await helper.createCategory();
    const product = await helper.createProduct(category.id);
    const cashbox = await helper.createCashbox(store.id);
    const { retail } = await helper.createPriceTypes();

    // 1. Initial Purchase (Qty 10, Price 100)
    await helper.createPurchase(store.id, vendor.id, product.id, 10, 100);

    // 2. Sale (Qty 3, Price 200)
    const sale = await helper.createSale(
      store.id,
      cashbox.id,
      retail.id,
      product.id,
      3,
      200,
    );

    const movements = await prismaService.stockMovement.findMany({
      where: { documentSaleId: sale.id },
    });

    expect(movements).toHaveLength(1);
    const mov = movements[0];
    expect(mov.type).toBe('SALE');
    expect(mov.quantity.toString()).toBe('-3'); // Negative for sale
    expect(mov.quantityAfter.toString()).toBe('7'); // 10 - 3
    expect(mov.averagePurchasePrice.toString()).toBe('100'); // Cost price unchanged
    expect(mov.storeId).toBe(store.id);
  });

  it('should log StockMovement on RETURN with correct snapshots', async () => {
    const store = await helper.createStore();
    const client = await helper.createClient();
    const category = await helper.createCategory();
    const product = await helper.createProduct(category.id);

    // Assume prior stock 5, WAP 100 (Created manually)
    await prismaService.stock.create({
      data: {
        storeId: store.id,
        productId: product.id,
        quantity: 5,
        averagePurchasePrice: 100,
      },
    });

    const returnDoc = await helper['documentReturnService'].create({
      storeId: store.id,
      clientId: client.id,
      date: new Date().toISOString(),
      status: 'COMPLETED',
      items: [{ productId: product.id, quantity: 2, price: 50 }],
    });
    helper.createdIds.returns.push(returnDoc.id);

    const movements = await prismaService.stockMovement.findMany({
      where: { documentReturnId: returnDoc.id },
    });

    expect(movements).toHaveLength(1);
    const mov = movements[0];
    expect(mov.type).toBe('RETURN');
    expect(mov.quantity.toString()).toBe('2');
    expect(mov.quantityAfter.toString()).toBe('7'); // 5 + 2
    // WAP should remain 100 (policy: return doesn't affect WAP)
    expect(mov.averagePurchasePrice.toString()).toBe('100');
  });

  it('should log StockMovement on ADJUSTMENT with correct snapshots', async () => {
    const store = await helper.createStore();
    const category = await helper.createCategory();
    const product = await helper.createProduct(category.id);

    // Initial Stock: 10, WAP: 50
    await prismaService.stock.create({
      data: {
        storeId: store.id,
        productId: product.id,
        quantity: 10,
        averagePurchasePrice: 50,
      },
    });

    // Adjustment: -3 (Loss/Shortage)
    const adj = await helper['documentAdjustmentService'].create({
      storeId: store.id,
      date: new Date().toISOString(),
      status: 'COMPLETED',
      items: [{ productId: product.id, quantity: -3 }],
    });
    helper.createdIds.adjustments.push(adj.id);

    const movements = await prismaService.stockMovement.findMany({
      where: { documentAdjustmentId: adj.id },
    });

    expect(movements).toHaveLength(1);
    const mov = movements[0];
    expect(mov.type).toBe('ADJUSTMENT');
    expect(mov.quantity.toString()).toBe('-3');
    expect(mov.quantityAfter.toString()).toBe('7');
    expect(mov.averagePurchasePrice.toString()).toBe('50');
  });

  it('should log StockMovements on TRANSFER (OUT and IN)', async () => {
    const sourceStore = await helper.createStore(); // "Store A"
    const destStore = await helper.createStore(); // "Store B"
    const category = await helper.createCategory();
    const product = await helper.createProduct(category.id);

    // Initial Stock in Source: 20, WAP: 10
    await prismaService.stock.create({
      data: {
        storeId: sourceStore.id,
        productId: product.id,
        quantity: 20,
        averagePurchasePrice: 10,
      },
    });

    // Transfer 5 from Source to Dest
    const transfer = await helper['documentTransferService'].create({
      sourceStoreId: sourceStore.id,
      destinationStoreId: destStore.id,
      date: new Date().toISOString(),
      status: 'COMPLETED',
      items: [{ productId: product.id, quantity: 5 }],
    });
    helper.createdIds.transfers.push(transfer.id);

    // Check OUT movement
    const outMoves = await prismaService.stockMovement.findMany({
      where: { documentTransferId: transfer.id, type: 'TRANSFER_OUT' },
    });
    expect(outMoves).toHaveLength(1);
    const outMov = outMoves[0];
    expect(outMov.storeId).toBe(sourceStore.id);
    expect(outMov.quantity.toString()).toBe('-5');
    expect(outMov.quantityAfter.toString()).toBe('15');
    expect(outMov.averagePurchasePrice.toString()).toBe('10');

    // Check IN movement
    const inMoves = await prismaService.stockMovement.findMany({
      where: { documentTransferId: transfer.id, type: 'TRANSFER_IN' },
    });
    expect(inMoves).toHaveLength(1);
    const inMov = inMoves[0];
    expect(inMov.storeId).toBe(destStore.id);
    expect(inMov.quantity.toString()).toBe('5');
    expect(inMov.quantityAfter.toString()).toBe('5'); // 0 + 5
    expect(inMov.averagePurchasePrice.toString()).toBe('10'); // Inherited cost
  });
});
