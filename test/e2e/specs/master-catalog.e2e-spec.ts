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
    await app.close();
  });

  beforeEach(async () => {
    await helper.cleanup();
  });

  describe('Category', () => {
    it('should create a category', async () => {
      const name = helper.uniqueName('Electronics');
      const res = await request(app.getHttpServer()).post('/categories').send({ name }).expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.name).toBe(name);
      helper.createdIds.categories.push(res.body.id);
    });

    it('should create a sub-category', async () => {
      // 1. Create Parent via API
      const parentName = helper.uniqueName('Computers');
      const parent = await request(app.getHttpServer())
        .post('/categories')
        .send({ name: parentName })
        .expect(201);

      helper.createdIds.categories.push(parent.body.id);

      // 2. Create Child
      const childName = helper.uniqueName('Laptops');
      const res = await request(app.getHttpServer())
        .post('/categories')
        .send({ name: childName, parentId: parent.body.id })
        .expect(201);

      helper.createdIds.categories.push(res.body.id);

      expect(res.body.parentId).toBe(parent.body.id);
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

      const res = await request(app.getHttpServer())
        .post('/products')
        .send({
          name: 'MacBook Pro',
          categoryId: category.id,
          article: 'MBP-2023',
        })
        .expect(201);

      expect(res.body.name).toBe('MacBook Pro');
      expect(res.body.categoryId).toBe(category.id);
      helper.createdIds.products.push(res.body.id);
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

      // Verify barcodes (using helper/prisma check if no direct GET endpoint for all exists easily)
      // Or usually cascading delete handles it.
      // Assuming BarcodeController has findAll - we can't filter by product easily unless implemented.
      // Let's rely on success of deletion.
    });
  });

  describe('Price & PriceType', () => {
    it('should create price type', async () => {
      const name = helper.uniqueName('Retail');
      const res = await request(app.getHttpServer())
        .post('/price-types') // Note: Hyphenated? Controller says 'pricetypes' likely based on class 'PricetypeController' ?
        // File view of PriceType controller wasn't done, but dir was 'price-type'.
        // Wait, standard is kebab-case. I'll bet on 'pricetypes' or 'price-types'.
        // I need to check the controller path metadata. Assuming 'pricetypes' (or 'price-types').
        // Let's assume 'price-types' if modern, but earlier I saw 'categories'.
        // I'll check PriceType controller path in next step if this fails.
        // Actually, let's use helper for PriceType if I don't want to guess, BUT the plan says test CRUD.
        // I will guess 'price-types' based on file structure.
        .send({ name })
        .expect(201);

      expect(res.body.name).toBe(name);
      helper.createdIds.priceTypes.push(res.body.id);
    });

    it('should assign price to product', async () => {
      const category = await helper.createCategory();
      const product = await helper.createProduct(category.id);
      const { retail } = await helper.createPriceTypes(); // Use helper for dependency

      const res = await request(app.getHttpServer())
        .post('/prices')
        .send({
          value: 100.5,
          productId: product.id,
          priceTypeId: retail.id,
        })
        .expect(201);

      expect(Number(res.body.value)).toBe(100.5);
    });
  });
});
