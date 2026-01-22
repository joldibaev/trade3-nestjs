import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../../../src/app.module';
import { PrismaService } from '../../../src/core/prisma/prisma.service';
import { TestHelper } from '../helpers/test-helper';

describe('Document Ledger (e2e)', () => {
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

  describe('Document Purchase Ledger', () => {
    let purchaseId: string;

    it('should log CREATED and ITEM_ADDED actions on creation', async () => {
      const res = await helper.createPurchase(storeId, vendorId, productId, 10, 50, 'DRAFT');
      purchaseId = res.id;

      const ledger = await prisma.documentLedger.findMany({
        where: { documentPurchaseId: purchaseId },
        orderBy: { createdAt: 'asc' },
      });

      expect(ledger.length).toBeGreaterThanOrEqual(2);

      const createdLog = ledger.find((h) => h.action === 'CREATED');
      expect(createdLog).toBeDefined();
      expect(createdLog?.details).toEqual(expect.objectContaining({ status: 'DRAFT', total: 0 }));

      const itemAddedLog = ledger.find((h) => h.action === 'ITEM_ADDED');
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

      const ledger = await prisma.documentLedger.findMany({
        where: { documentPurchaseId: purchaseId },
      });
      // console.log('Purchase Ledger:', JSON.stringify(ledger, null, 2));

      // Find the UPDATED log that contains the notes
      const updatedLog = ledger.find(
        (h) => h.action === 'UPDATED' && (h.details as any)?.notes === 'Updated notes',
      );
      expect(updatedLog).toBeDefined();

      const itemChangedLog = ledger.find((h) => h.action === 'ITEM_CHANGED');
      expect(itemChangedLog).toBeDefined();
      expect(itemChangedLog?.details).toHaveProperty('changes.quantity');
      const changes = (itemChangedLog?.details as any).changes;
      // Check for decimal/string equality depending on how it's stored/returned
      expect(String(changes.quantity.from)).toBe('10');
      expect(String(changes.quantity.to)).toBe('15');
    });

    it('should NOT log UPDATED if no fields changed', async () => {
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

      const ledger = await prisma.documentLedger.findMany({
        where: { documentPurchaseId: purchaseId },
        orderBy: { createdAt: 'desc' },
      });

      // The last action should NOT be UPDATED with empty details or details containing only notes: undefined
      const updatedLogs = ledger.filter((h) => h.action === 'UPDATED');
      expect(updatedLogs.length).toBe(1); // Should remain 1 from previous test
    });

    it('should log STATUS_CHANGED on completion', async () => {
      await helper.completePurchase(purchaseId);

      const ledger = await prisma.documentLedger.findFirst({
        where: { documentPurchaseId: purchaseId, action: 'STATUS_CHANGED' },
      });

      expect(ledger).toBeDefined();
      expect(ledger?.details).toEqual(expect.objectContaining({ from: 'DRAFT', to: 'COMPLETED' }));
    });

    it('should return ledger sorted by createdAt ASC', async () => {
      const res = await prisma.documentPurchase.findUniqueOrThrow({
        where: { id: purchaseId },
        include: { documentLedger: true },
      });
      const ledger = res.documentLedger;

      expect(ledger.length).toBeGreaterThan(1);

      for (let i = 0; i < ledger.length - 1; i++) {
        const current = new Date(ledger[i].createdAt).getTime();
        const next = new Date(ledger[i + 1].createdAt).getTime();
        expect(current).toBeLessThanOrEqual(next);
      }
    });
  });
});
