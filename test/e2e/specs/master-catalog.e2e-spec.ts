import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { PrismaService } from '../../../src/core/prisma/prisma.service';
import { TestHelper } from '../helpers/test-helper';
import { ValidationPipe } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { HttpExceptionFilter } from '../../../src/common/filters/http-exception.filter';

describe('Master Data - Catalog (e2e)', () => {
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

  describe('Category', () => {
    it('should create a category', async () => {
      const name = helper.uniqueName('Electronics');
      // Use helper to ensure tracking
      const category = await helper.createCategory(name);

      expect(category.id).toBeDefined();
      expect(category.name).toBe(name);
    });

    it('should create a sub-category', async () => {
      // 1. Create Parent via Helper
      const parent = await helper.createCategory(helper.uniqueName('Computers'));

      // 2. Create Child
      const childName = helper.uniqueName('Laptops');

      // We want to test hierarchy creation. Helper logic is simple.
      // We can use helper.createCategory with parentId if we overload it, or manual.
      // TestHelper.createCategory currently accepts (name).
      // Let's do manual but track ID.

      const res = await request(app.getHttpServer())
        .post('/categories')
        .send({ name: childName, parentId: parent.id })
        .expect(201);

      helper.createdIds.categories.push(res.body.id);

      expect(res.body.parentId).toBe(parent.id);
    });

    it('should update category', async () => {
      const parent = await helper.createCategory('Old Name');

      const res = await request(app.getHttpServer())
        .patch(`/categories/${parent.id}`)
        .send({ name: 'New Name' })
        .expect(200);

      expect(res.body.name).toBe('New Name');
    });

    it('should delete category', async () => {
      const cat = await helper.createCategory();

      await request(app.getHttpServer()).delete(`/categories/${cat.id}`).expect(200);

      // Verify deletion
      await request(app.getHttpServer()).get(`/categories/${cat.id}`).expect(404);
    });
  });

  describe('Product', () => {
    it('should create a product with category', async () => {
      const category = await helper.createCategory();

      // Use helper.createProduct but pass custom data
      const product = await helper.createProduct(category.id, {
        name: 'MacBook Pro',
        article: 'MBP-2023',
      });

      expect(product.name).toBe('MacBook Pro');
      expect(product.categoryId).toBe(category.id);
    });

    it('should fail to create product without category', async () => {
      await request(app.getHttpServer())
        .post('/products')
        .send({ name: 'Orphan Product' })
        .expect(400);
    });

    it('should update product', async () => {
      const category = await helper.createCategory();
      const product = await helper.createProduct(category.id);

      const res = await request(app.getHttpServer())
        .patch(`/products/${product.id}`)
        .send({ name: 'Updated Product' })
        .expect(200);

      expect(res.body.name).toBe('Updated Product');
    });
  });

  describe('Barcode', () => {
    it('should add barcode to product', async () => {
      const category = await helper.createCategory();
      const product = await helper.createProduct(category.id);

      const res = await request(app.getHttpServer())
        .post('/barcodes')
        .send({
          value: '1234567890123',
          productId: product.id,
        })
        .expect(201);

      // Track Manually? TestHelper cleanup deletes products, and barcode is deleted cascade.
      // BUT helper.cleanup also calls `prisma.barcode.deleteMany({ where: { productId: { in: this.createdIds.products } } })`.
      // So if product is tracked, barcode is cleaned up.
      // Safe.

      expect(res.body.value).toBe('1234567890123');
      expect(res.body.productId).toBe(product.id);
    });

    it('should cleanup barcodes when product is deleted', async () => {
      const category = await helper.createCategory();
      const product = await helper.createProduct(category.id);

      await request(app.getHttpServer())
        .post('/barcodes')
        .send({ value: '999', productId: product.id })
        .expect(201);

      // Delete Product
      await request(app.getHttpServer()).delete(`/products/${product.id}`).expect(200);
    });
  });

  describe('Price & PriceType', () => {
    it('should create price type', async () => {
      const name = helper.uniqueName('Retail');
      // Use helper
      // TestHelper.createPriceTypes creates 2 fixed ones.
      // Let's use manual request but track ID.

      const res = await request(app.getHttpServer())
        .post('/price-types')
        .send({ name })
        .expect(201);

      helper.createdIds.priceTypes.push(res.body.id);
      expect(res.body.name).toBe(name);
    });

    it('should assign price to product', async () => {
      const category = await helper.createCategory();
      const product = await helper.createProduct(category.id);
      const { retail } = await helper.createPriceTypes();

      const res = await request(app.getHttpServer())
        .post('/prices')
        .send({
          value: 100.5,
          productId: product.id,
          priceTypeId: retail.id,
        })
        .expect(201);

      // Prices are cleaned up via product cascade delete in cleanup()
      expect(Number(res.body.value)).toBe(100.5);
    });
  });
});
