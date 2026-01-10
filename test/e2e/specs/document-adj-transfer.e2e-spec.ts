import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../../src/app.module'; // Adjust path
import { PrismaService } from '../../../src/core/prisma/prisma.service'; // Adjust path

describe('Document Adjustment & Transfer (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let storeId: string;
  let store2Id: string;
  let categoryId: string;
  let priceTypeId: string;
  let productId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);

    // Setup Test Data
    const uniqueId = Date.now();
    const store = await prisma.store.create({
      data: { name: `Test Store Adj ${uniqueId}` },
    });
    storeId = store.id;

    const store2 = await prisma.store.create({
      data: { name: `Test Store Dest ${uniqueId}` },
    });
    store2Id = store2.id;

    const category = await prisma.category.create({
      data: { name: `Test Category Adj ${uniqueId}` },
    });
    categoryId = category.id;

    const priceType = await prisma.priceType.create({
      data: { name: `Test PriceType ${uniqueId}` },
    });
    priceTypeId = priceType.id;

    const product = await prisma.product.create({
      data: {
        name: `Test Product Adj ${uniqueId}`,
        // sku removed as it's not in schema
        article: `ART-${uniqueId}`, // Use article instead if needed
        categoryId: categoryId,
        barcodes: {
          create: {
            value: `1234567890Adj${uniqueId}`,
          },
        },
        prices: {
          create: {
            value: 100,
            priceTypeId: priceTypeId,
          },
        },
      },
    });
    productId = product.id;

    // Initial Stock
    await prisma.stock.create({
      data: {
        storeId,
        productId,
        quantity: 100,
        averagePurchasePrice: 50,
      },
    });
  });

  afterAll(async () => {
    // Cleanup
    if (productId) {
      // Delete dependents first
      await prisma.stockMovement.deleteMany({ where: { productId } });
      await prisma.stock.deleteMany({ where: { productId } });
      await prisma.documentAdjustmentItem.deleteMany({ where: { productId } });
      await prisma.documentTransferItem.deleteMany({ where: { productId } });

      await prisma.barcode.deleteMany({ where: { productId } });
      await prisma.price.deleteMany({ where: { productId } });

      // Finally product
      await prisma.product.delete({ where: { id: productId } });
    }

    if (storeId) {
      await prisma.documentAdjustment.deleteMany({ where: { storeId } });
      await prisma.documentTransfer.deleteMany({ where: { sourceStoreId: storeId } });
      await prisma.store.delete({ where: { id: storeId } });
    }
    if (store2Id) {
      await prisma.store.delete({ where: { id: store2Id } });
    }
    if (categoryId) {
      await prisma.category.delete({ where: { id: categoryId } });
    }
    if (priceTypeId) {
      await prisma.priceType.delete({ where: { id: priceTypeId } });
    }

    await app.close();
  });

  describe('Document Adjustment', () => {
    let adjustmentId: string;

    it('should create a DRAFT adjustment', async () => {
      const res = await request(app.getHttpServer())
        .post('/document-adjustments')
        .send({
          storeId,
          date: new Date(),
          status: 'DRAFT',
          items: [
            { productId, quantity: 10 }, // Adding 10
          ],
        })
        .expect(201);

      adjustmentId = res.body.id;
      expect(res.body.status).toBe('DRAFT');
    });

    it('should complete adjustment', async () => {
      await request(app.getHttpServer())
        .patch(`/document-adjustments/${adjustmentId}/status`)
        .send({ status: 'COMPLETED' })
        .expect(200);

      const stock = await prisma.stock.findUnique({
        where: { productId_storeId: { productId, storeId } },
      });
      // 100 + 10 = 110
      expect(stock?.quantity.toNumber()).toBe(110);
    });
  });

  describe('Document Transfer', () => {
    let transferId: string;

    it('should create a DRAFT transfer', async () => {
      const res = await request(app.getHttpServer())
        .post('/document-transfers')
        .send({
          sourceStoreId: storeId,
          destinationStoreId: store2Id, // Transferring to Store 2
          date: new Date(),
          status: 'DRAFT',
          items: [
            { productId, quantity: 20 }, // Transferring 20
          ],
        })
        .expect(201);

      transferId = res.body.id;
      expect(res.body.status).toBe('DRAFT');
    });

    it('should complete transfer', async () => {
      await request(app.getHttpServer())
        .patch(`/document-transfers/${transferId}/status`)
        .send({ status: 'COMPLETED' })
        .expect(200);

      // Source Store: 110 - 20 = 90
      const sourceStock = await prisma.stock.findUnique({
        where: { productId_storeId: { productId, storeId } },
      });
      expect(sourceStock?.quantity.toNumber()).toBe(90);

      // Dest Store: 0 + 20 = 20
      const destStock = await prisma.stock.findUnique({
        where: { productId_storeId: { productId, storeId: store2Id } },
      });
      expect(destStock?.quantity.toNumber()).toBe(20);
    });
  });
});
