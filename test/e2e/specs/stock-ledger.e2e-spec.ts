import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyCookie from '@fastify/cookie';
import { ZodValidationPipe } from 'nestjs-zod';
import { AppModule } from '../../../src/app.module';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { InventoryService } from '../../../src/inventory/inventory.service';
import { TestHelper } from '../helpers/test-helper';

describe('Stock Ledger Audit Flow (E2E)', () => {
  let app: NestFastifyApplication;
  let prismaService: PrismaService;
  let helper: TestHelper;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.register(fastifyCookie);
    app.useGlobalPipes(new ZodValidationPipe());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    prismaService = app.get<PrismaService>(PrismaService);
    const prisma = app.get(PrismaService);
    helper = new TestHelper(app, prisma);
  });

  afterEach(async () => {
    await helper?.cleanup();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should log StockLedger on PURCHASE with correct snapshots', async () => {
    const store = await helper.createStore();
    const vendor = await helper.createVendor();
    const category = await helper.createCategory();
    const product = await helper.createProduct(category.id);

    const qty = 10;
    const price = 100;

    const purchase = await helper.createPurchase(store.id, vendor.id, product.id, qty, price);

    const movements = await prismaService.stockLedger.findMany({
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

  it('should log StockLedger on SALE with correct snapshots', async () => {
    const store = await helper.createStore();
    const vendor = await helper.createVendor();
    const category = await helper.createCategory();
    const product = await helper.createProduct(category.id);
    const cashbox = await helper.createCashbox(store.id);
    const { retail } = await helper.createPriceTypes();

    // 1. Initial Purchase (Qty 10, Price 100)
    await helper.createPurchase(store.id, vendor.id, product.id, 10, 100);

    // 2. Sale (Qty 3, Price 200)
    const sale = await helper.createSale(store.id, cashbox.id, retail.id, product.id, 3, 200);

    const movements = await prismaService.stockLedger.findMany({
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

  it('should log StockLedger on RETURN with correct snapshots', async () => {
    const store = await helper.createStore();
    const client = await helper.createClient();
    const category = await helper.createCategory();
    const product = await helper.createProduct(category.id);

    // Initial Stock: 5, WAP: 100
    await helper.addStock(store.id, product.id, 5, 100);

    const returnDoc = await helper.createReturn(
      store.id,
      client.id,
      product.id,
      2,
      100,
      'COMPLETED',
    );
    helper.createdIds.returns.push(returnDoc.id);

    const movements = await prismaService.stockLedger.findMany({
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

  it('should log StockLedger on ADJUSTMENT with correct snapshots', async () => {
    const store = await helper.createStore();
    const category = await helper.createCategory();
    const product = await helper.createProduct(category.id);

    // Initial Stock: 10, WAP: 50
    await helper.addStock(store.id, product.id, 10, 50);

    // Adjustment: -3 (Loss/Shortage)
    const adj = await helper.createAdjustment(store.id, product.id, -3, 'COMPLETED');
    helper.createdIds.adjustments.push(adj.id);

    const movements = await prismaService.stockLedger.findMany({
      where: { documentAdjustmentId: adj.id },
    });

    expect(movements).toHaveLength(1);
    const mov = movements[0];
    expect(mov.type).toBe('ADJUSTMENT');
    expect(mov.quantity.toString()).toBe('-3');
    expect(mov.quantityAfter.toString()).toBe('7');
    expect(mov.averagePurchasePrice.toString()).toBe('50');
  });

  it('should log StockLedger on TRANSFER (OUT and IN)', async () => {
    const sourceStore = await helper.createStore(); // "Store A"
    const destStore = await helper.createStore(); // "Store B"
    const category = await helper.createCategory();
    const product = await helper.createProduct(category.id);

    // Initial Stock in Source: 20, WAP: 10
    await helper.addStock(sourceStore.id, product.id, 20, 10);

    // Transfer 5 from Source to Dest
    const transfer = await helper.createTransfer(
      sourceStore.id,
      destStore.id,
      product.id,
      5,
      'COMPLETED',
    );
    helper.createdIds.transfers.push(transfer.id);

    // Check OUT movement
    const outMoves = await prismaService.stockLedger.findMany({
      where: { documentTransferId: transfer.id, type: 'TRANSFER_OUT' },
    });
    expect(outMoves).toHaveLength(1);
    const outMov = outMoves[0];
    expect(outMov.storeId).toBe(sourceStore.id);
    expect(outMov.quantity.toString()).toBe('-5');
    expect(outMov.quantityAfter.toString()).toBe('15');
    expect(outMov.averagePurchasePrice.toString()).toBe('10');

    // Check IN movement
    const inMoves = await prismaService.stockLedger.findMany({
      where: { documentTransferId: transfer.id, type: 'TRANSFER_IN' },
    });
    expect(inMoves).toHaveLength(1);
    const inMov = inMoves[0];
    expect(inMov.storeId).toBe(destStore.id);
    expect(inMov.quantity.toString()).toBe('5');
    expect(inMov.quantityAfter.toString()).toBe('5'); // 0 + 5
    expect(inMov.averagePurchasePrice.toString()).toBe('10'); // Inherited cost
  });

  it('should handle backdated reprocessing via Strict Storno (REVERSAL + CORRECTION)', async () => {
    const store = await helper.createStore();
    const vendor = await helper.createVendor();
    const category = await helper.createCategory();
    const product = await helper.createProduct(category.id);
    const cashbox = await helper.createCashbox(store.id);
    const { retail } = await helper.createPriceTypes();

    // 1. First Purchase: 10 units at 100$ (Date: today - 2 days)
    const date1 = new Date();
    date1.setDate(date1.getDate() - 2);
    const p1 = await helper.createPurchase(
      store.id,
      vendor.id,
      product.id,
      10,
      100,
      'COMPLETED',
      undefined,
      201,
      date1,
    );

    // 2. A Sale: 5 units (Date: today - 1 day). WAP should be 100$.
    const date2 = new Date();
    date2.setDate(date2.getDate() - 1);
    await helper.createSale(
      store.id,
      cashbox.id,
      retail.id,
      product.id,
      5,
      200,
      undefined,
      'COMPLETED',
      201,
      date2,
    );

    // 3. Update the first Purchase (Date: today - 2 days) -> change price to 120$
    // We update the item price in the DB directly for this test
    await prismaService.documentPurchaseItem.updateMany({
      where: { purchaseId: p1.id, productId: product.id },
      data: { price: 120, total: 10 * 120 },
    });
    // And recalculate document total
    await prismaService.documentPurchase.update({
      where: { id: p1.id },
      data: { total: 1200 },
    });

    const inventoryService = app.get(InventoryService);
    await inventoryService.reprocessProductHistory(
      store.id,
      product.id,
      date1,
      'reprocess-test-causation',
    );

    // 4. VERIFY LEDGER (Strict Storno)
    const ledger = await prismaService.stockLedger.findMany({
      where: { productId: product.id, storeId: store.id },
      orderBy: { createdAt: 'asc' },
    });

    // Expected sequence:
    // 0: PURCHASE (10, 100) - Initial
    // 1: SALE (-5, 100) - Initial
    // 2: REVERSAL of SALE snapshots (recalculating the same values because price didn't change for sale, but snapshots might have shifted if purchase qty changed. In this case, only purchase PRICE changed).
    // Actually, sale snapshots depend on purchase WAP.
    // If Purchase was (10, 100) -> WAP 100. Sale (-5) -> Snap: Q5, WAP 100.
    // After reprocess: Purchase is still (10, 100) in ledger record, but reprocess logic finds it...
    // Wait, the test helper doesn't actually trigger reprocess on "Update" automatically yet unless I call it.

    // Total count should have increased
    expect(ledger.length).toBeGreaterThan(2);

    // Filter for CORRECTION and REVERSAL
    const corrections = ledger.filter((l) => l.reason === 'CORRECTION');
    const reversals = ledger.filter((l) => l.reason === 'REVERSAL');
    const initials = ledger.filter((l) => l.reason === 'INITIAL');

    expect(initials.length).toBe(2); // P1 + S1
    // At least one reversal/correction pair should exist for the Sale if its snapshot (WAP) was corrected.
    expect(reversals.length).toBeGreaterThanOrEqual(1);
    expect(corrections.length).toBeGreaterThanOrEqual(1);

    // Verify parent links
    const correction = corrections[0];
    expect(correction.parentLedgerId).toBeDefined();
    expect(correction.causationId).toBe('reprocess-test-causation');

    // Verify final stock state
    const stock = await prismaService.stock.findUnique({
      where: { productId_storeId: { productId: product.id, storeId: store.id } },
    });
    expect(stock?.quantity.toString()).toBe('5');
  });
});
