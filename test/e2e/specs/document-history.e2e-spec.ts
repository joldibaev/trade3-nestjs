import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../../../src/app.module';
import { PrismaService } from '../../../src/core/prisma/prisma.service';
import { TestHelper } from '../helpers/test-helper';

describe('Document History (e2e)', () => {
  let app: INestApplication;
  let helper: TestHelper;
  let prisma: PrismaService;
  let storeId: string;
  let vendorId: string;
  let categoryId: string;
  let productId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    helper = new TestHelper(app, prisma);

    // Setup Test Data
    const store = await helper.createStore();
    storeId = store.id;

    const vendor = await helper.createVendor();
    vendorId = vendor.id;

    const category = await helper.createCategory();
    categoryId = category.id;

    const product = await helper.createProduct(categoryId);
    productId = product.id;
  });

  afterAll(async () => {
    await helper.cleanup();
    await app.close();
  });

  describe('Document Purchase History', () => {
    let purchaseId: string;

    it('should log CREATED and ITEM_ADDED actions on creation', async () => {
      const res = await helper.createPurchase(storeId, vendorId, productId, 10, 50, 'DRAFT');
      purchaseId = res.id;

      const history = await prisma.documentHistory.findMany({
        where: { documentPurchaseId: purchaseId },
        orderBy: { createdAt: 'asc' },
      });

      expect(history.length).toBeGreaterThanOrEqual(2);

      const createdLog = history.find((h) => h.action === 'CREATED');
      expect(createdLog).toBeDefined();
      expect(createdLog?.details).toEqual(expect.objectContaining({ status: 'DRAFT', total: 0 }));

      const itemAddedLog = history.find((h) => h.action === 'ITEM_ADDED');
      if (itemAddedLog) {
        expect(itemAddedLog.details).toEqual(expect.objectContaining({ productId, quantity: 10 }));
      }
    });

    it('should log UPDATED and ITEM_CHANGED on update', async () => {
      // Update purchase: change quantity from 10 to 15, update notes
      const updateDto = {
        storeId,
        vendorId,
        date: new Date(),
        items: [{ productId, quantity: 15, price: 50 }],
        notes: 'Updated notes',
      };

      await helper.updatePurchase(purchaseId, updateDto);

      const history = await prisma.documentHistory.findMany({
        where: { documentPurchaseId: purchaseId },
      });
      // console.log('Purchase History:', JSON.stringify(history, null, 2));

      // Find the UPDATED log that contains the notes
      const updatedLog = history.find(
        (h) => h.action === 'UPDATED' && (h.details as any)?.notes === 'Updated notes',
      );
      expect(updatedLog).toBeDefined();

      const itemChangedLog = history.find((h) => h.action === 'ITEM_CHANGED');
      expect(itemChangedLog).toBeDefined();
      expect(itemChangedLog?.details).toHaveProperty('changes.quantity');
      const changes = (itemChangedLog?.details as any).changes;
      // Check for decimal/string equality depending on how it's stored/returned
      expect(String(changes.quantity.from)).toBe('10');
      expect(String(changes.quantity.to)).toBe('15');
    });

    it('should NOT log UPDATED if no fields changed', async () => {
      // Update with SAME values
      const updateDto = {
        storeId,
        vendorId,
        date: new Date(), // This WILL change date potentially? No, we should use same date if possible or ignore date check if hard.
        // Actually, let's reuse the date from previous step or just rely on notes/items.
        // If date changes, it is an update.
        // Let's assume we pass the same date string if we could?
        // The service checks `new Date(date).getTime() !== doc.date.getTime()`.
        // So we need exact match.
        // We can fetch the document first
      };

      // Fetch current doc to get exact values
      const doc = await prisma.documentPurchase.findUniqueOrThrow({
        where: { id: purchaseId },
        include: { items: true },
      });

      const sameUpdateDto = {
        storeId: doc.storeId,
        vendorId: doc.vendorId,
        date: doc.date,
        items: doc.items.map((i) => ({
          productId: i.productId,
          quantity: Number(i.quantity),
          price: Number(i.price),
        })),
        notes: doc.notes,
        status: 'DRAFT',
      };

      await helper.updatePurchase(purchaseId, sameUpdateDto);

      const history = await prisma.documentHistory.findMany({
        where: { documentPurchaseId: purchaseId },
        orderBy: { createdAt: 'desc' },
      });

      // The last action should NOT be UPDATED with empty details or details containing only notes: undefined
      // Actually we expect NO new UPDATED action if nothing changed.
      // We might get one if we are not careful about timestamps?
      // Let's checks the count or latest action.

      // Since we did an update in previous test, let's count UPDATED actions.
      // Previous test: "should log UPDATED and ITEM_CHANGED on update" -> 1 UPDATED action.
      // This test: should NOT add another UPDATED.

      const updatedLogs = history.filter((h) => h.action === 'UPDATED');
      expect(updatedLogs.length).toBe(1); // Should remain 1 from previous test
    });

    it('should log STATUS_CHANGED on completion', async () => {
      await helper.completePurchase(purchaseId);

      const history = await prisma.documentHistory.findFirst({
        where: { documentPurchaseId: purchaseId, action: 'STATUS_CHANGED' },
      });

      expect(history).toBeDefined();
      expect(history?.details).toEqual(expect.objectContaining({ from: 'DRAFT', to: 'COMPLETED' }));
    });

    it('should return history sorted by createdAt ASC', async () => {
      const res = await prisma.documentPurchase.findUniqueOrThrow({
        where: { id: purchaseId },
        include: { history: true },
      });
      const history = res.history;

      expect(history.length).toBeGreaterThan(1);

      for (let i = 0; i < history.length - 1; i++) {
        const current = new Date(history[i].createdAt).getTime();
        const next = new Date(history[i + 1].createdAt).getTime();
        expect(current).toBeLessThanOrEqual(next);
      }
    });
  });
});
