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
    await app.close();
  });

  beforeEach(async () => {
    await helper.cleanup();
  });

  describe('GET /products?query=...', () => {
    it('should find product by name', async () => {
      const category = await helper.createCategory();
      const product = await helper.createProduct(category.id, { name: 'Searchable Product' });
      await helper.createProduct(category.id, { name: 'Other Product' });

      const res = await request(app.getHttpServer())
        .get('/products')
        .query({ query: 'Searchable' })
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe(product.id);
    });

    it('should find product by article', async () => {
      const category = await helper.createCategory();
      const product = await helper.createProduct(category.id, {
        name: 'Product with Article',
        article: 'ART-123',
      });
      await helper.createProduct(category.id, { name: 'Other Product', article: 'ART-456' });

      const res = await request(app.getHttpServer())
        .get('/products')
        .query({ query: 'ART-123' })
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe(product.id);
    });

    it('should find product by barcode', async () => {
      const category = await helper.createCategory();
      const product = await helper.createProduct(category.id, { name: 'Product with Barcode' });
      const otherProduct = await helper.createProduct(category.id, { name: 'Other Product' });

      // Add barcode using API or Prisma? Helper probably has a way or we can use API.
      // Looking at master-catalog.e2e-spec.ts, it uses API /barcodes.
      // But helper might be faster. checking helper methods involves reading test-helper.ts.
      // For now, I'll assume I can just use API or maybe I should check helper.
      // Let's use API to be safe as per master-catalog spec.

      await request(app.getHttpServer())
        .post('/barcodes')
        .send({ value: '111222333', productId: product.id })
        .expect(201);

      await request(app.getHttpServer())
        .post('/barcodes')
        .send({ value: '444555666', productId: otherProduct.id })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/products')
        .query({ query: '111222333' })
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe(product.id);
    });

    it('should return empty list if no matches', async () => {
      const category = await helper.createCategory();
      await helper.createProduct(category.id, { name: 'Product A' });

      const res = await request(app.getHttpServer())
        .get('/products')
        .query({ query: 'NonExistent' })
        .expect(200);

      expect(res.body).toHaveLength(0);
    });

    it('should be case insensitive', async () => {
      const category = await helper.createCategory();
      const product = await helper.createProduct(category.id, { name: 'MIXED Case Product' });

      const res = await request(app.getHttpServer())
        .get('/products')
        .query({ query: 'mixed' })
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe(product.id);
    });
  });
});
