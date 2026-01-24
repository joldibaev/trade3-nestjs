import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { PrismaService } from '../../../src/core/prisma/prisma.service';
import { TestHelper } from '../helpers/test-helper';
import { ValidationPipe } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { HttpExceptionFilter } from '../../../src/common/filters/http-exception.filter';

describe('Product Search (e2e)', () => {
  let app: INestApplication;
  let helper: TestHelper;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Apply globals
    const httpAdapterHost = app.get(HttpAdapterHost);
    app.useGlobalFilters(new HttpExceptionFilter(httpAdapterHost));
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );

    await app.init();

    const prismaService = app.get(PrismaService);
    helper = new TestHelper(app, prismaService);
  });

  afterAll(async () => {
    await helper.cleanup();
    await app.close();
  });

  beforeEach(async () => {
    await helper.cleanup();
  });

  describe('GET /products?query=...', () => {
    it('should find product by name', async () => {
      const category = await helper.createCategory();
      const uniqueName = helper.uniqueName('Searchable Product');
      const product = await helper.createProduct(category.id, { name: uniqueName });
      await helper.createProduct(category.id, { name: helper.uniqueName('Other Product') });

      const res = await request(app.getHttpServer())
        .get('/products')
        .query({ query: uniqueName.split('_')[0] + ' ' + uniqueName.split('_')[2] }) // Search by parts of unique name or just full unique name
        // actually full unique name is safer
        .query({ query: uniqueName })
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe(product.id);
    });

    it('should find product by multiple tokens (intersection)', async () => {
      const category = await helper.createCategory();
      const product = await helper.createProduct(category.id, {
        name: 'Professional Drill 2000',
        article: 'DEW-X1',
      });
      await helper.createProduct(category.id, {
        name: 'Professional Saw 3000',
        article: 'DEW-Y2',
      });

      // Search by tokens from different fields
      const res = await request(app.getHttpServer())
        .get('/products')
        .query({ query: 'drill professional DEW' })
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe(product.id);
    });

    it('should NOT find product if one token does not match', async () => {
      const category = await helper.createCategory();
      await helper.createProduct(category.id, {
        name: 'Professional Drill 2000',
        article: 'DEW-X1',
      });

      const res = await request(app.getHttpServer())
        .get('/products')
        .query({ query: 'drill bosch' }) // 'bosch' won't match
        .expect(200);

      expect(res.body).toHaveLength(0);
    });

    it('should find product by code', async () => {
      const category = await helper.createCategory();
      const product = await helper.createProduct(category.id, {
        name: 'Product X',
        code: 'UNIQUE123',
      });

      const res = await request(app.getHttpServer())
        .get('/products')
        .query({ query: 'UNIQUE' })
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe(product.id);
    });

    it('should find product by article', async () => {
      const category = await helper.createCategory();
      const uniqueArticle = `ART-${Date.now()}`;
      const product = await helper.createProduct(category.id, {
        name: 'Product with Article',
        article: uniqueArticle,
      });
      await helper.createProduct(category.id, {
        name: 'Other Product',
        article: `ART-${Date.now() + 1}`,
      });

      const res = await request(app.getHttpServer())
        .get('/products')
        .query({ query: uniqueArticle })
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe(product.id);
    });

    it('should find product by barcode', async () => {
      const category = await helper.createCategory();
      const product = await helper.createProduct(category.id, { name: 'Product with Barcode' });
      const otherProduct = await helper.createProduct(category.id, { name: 'Other Product' });

      const uniqueBarcode = `CODE${Date.now()}`;
      const otherBarcode = `CODE${Date.now() + 1}`;

      const res1 = await request(app.getHttpServer())
        .post('/barcodes')
        .send({ value: uniqueBarcode, productId: product.id })
        .expect(201);
      // Track barcode manually just in case
      // helper.createdIds does not track barcodes explicitly in all helper versions,
      // but let's assume it has no 'barcodes' array?
      // Checking helper... `createdIds` has NO `barcodes` field.
      // Ah, cleanup deletes barcodes via productId.
      // So no need to push to non-existent array.
      // This test is safe as long as products are tracked.

      await request(app.getHttpServer())
        .post('/barcodes')
        .send({ value: otherBarcode, productId: otherProduct.id })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/products')
        .query({ query: uniqueBarcode })
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe(product.id);
    });

    it('should return empty list if no matches', async () => {
      const category = await helper.createCategory();
      await helper.createProduct(category.id, { name: helper.uniqueName('Product A') });

      const res = await request(app.getHttpServer())
        .get('/products')
        .query({ query: `NonExistent_${Date.now()}` })
        .expect(200);

      expect(res.body).toHaveLength(0);
    });

    it('should be case insensitive', async () => {
      const category = await helper.createCategory();
      const suffix = Date.now().toString();
      const mixedCaseName = `MIXED Case Product ${suffix}`;
      const product = await helper.createProduct(category.id, { name: mixedCaseName });

      const res = await request(app.getHttpServer())
        .get('/products')
        .query({ query: `mixed case product ${suffix}`.toLowerCase() }) // Search lower case unique string
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe(product.id);
    });
  });
});
