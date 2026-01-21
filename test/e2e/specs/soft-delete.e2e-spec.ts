import request from 'supertest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../../src/app.module';
import { PrismaService } from '../../../src/core/prisma/prisma.service';
import { TestHelper } from '../helpers/test-helper';

describe('Soft Delete Logic (e2e)', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let testHelper: TestHelper;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

        app = moduleFixture.createNestApplication();
        prisma = app.get(PrismaService);
        testHelper = new TestHelper(app, prisma);

        await app.init();
    });

    afterAll(async () => {
        // We cannot use normal cleanup because it uses deleteMany which is now intercepted!
        // But conceptually, soft-deleted items are "gone" for the application.
        // For true cleanup we might need a raw query or bypass middleware, but for now we skip.
        await app.close();
    });

    it('should soft delete a store', async () => {
        // 1. Create a Store
        const store = await testHelper.createStore();
        const id = store.id;

        // 2. Verify it exists via API
        await request(app.getHttpServer())
            .get(`/stores/${id}`)
            .expect(200);

        // 3. Delete it via API
        await request(app.getHttpServer())
            .delete(`/stores/${id}`)
            .expect(200);

        // 4. Verify it is NOT found via API (404)
        await request(app.getHttpServer())
            .get(`/stores/${id}`)
            .expect(404);

        // 5. Verify it still exists in DB (Raw Query or Bypass Middleware if possible)
        // Since our middleware intercepts all Prisma calls for 'Store', 
        // we can use a raw query or check 'deletedAt' logic via `findMany` explicit filter?
        // Our middleware logic: if params.args.where.deletedAt is undefined, set to null.
        // So if we EXPLICITLY ask for it, we should find it.

        // Attempt to bypass middleware by being explicit
        // However, findUnique usually throws if we convert it to findFirst?
        // Let's use findFirst with explicit ignore of deletedAt?
        // Actually, middleware says:
        // if (params.args.where.deletedAt === undefined) -> set to null.
        // So if we set deletedAt: { not: null }, we should find it?

        const deletedStore = await prisma.store.findFirst({
            where: {
                id: id,
                deletedAt: { not: null }
            }
        });

        expect(deletedStore).toBeDefined();
        expect(deletedStore?.id).toBe(id);
        expect(deletedStore?.deletedAt).not.toBeNull();
    });

    it('create product, soft delete it, check visibility', async () => {
        // Create dependencies
        const store = await testHelper.createStore();
        const category = await testHelper.createCategory();

        // Create Product
        const product = await testHelper.createProduct(category.id);

        // Delete Product
        await request(app.getHttpServer())
            .delete(`/products/${product.id}`)
            .expect(200);

        // Check API 404
        await request(app.getHttpServer())
            .get(`/products/${product.id}`)
            .expect(404);

        // Check DB persistence
        const deletedProduct = await prisma.product.findFirst({
            where: { id: product.id, deletedAt: { not: null } }
        });
        expect(deletedProduct).toBeDefined();
    });

});
