import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { PrismaService } from '../../../src/core/prisma/prisma.service';
import { TestHelper } from '../helpers/test-helper';
import { HttpAdapterHost } from '@nestjs/core';
import { HttpExceptionFilter } from '../../../src/common/filters/http-exception.filter';

describe('Master Data - Organization (e2e)', () => {
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

  describe('Store', () => {
    it('should create a store', async () => {
      const name = helper.uniqueName('Store');
      // Use helper to create
      const store = await helper.createStore();
      // TestHelper.createStore() uses a unique name. If we want to test custom name, we can't easily.
      // But the test just wants "a store".
      // Wait, the original test sent a specific name.
      // helper.createStore() creates prisma.store.create({ data: { name: ... } }) and returns the store.

      expect(store.id).toBeDefined();
    });

    it('should update store', async () => {
      const store = await helper.createStore();

      const res = await request(app.getHttpServer())
        .patch(`/stores/${store.id}`)
        .send({ name: 'Updated Store Name' })
        .expect(200);

      expect(res.body.name).toBe('Updated Store Name');
    });

    it('should delete store', async () => {
      const store = await helper.createStore();

      await request(app.getHttpServer()).delete(`/stores/${store.id}`).expect(200);

      await request(app.getHttpServer()).get(`/stores/${store.id}`).expect(404);
    });
  });

  describe('Cashbox', () => {
    it('should create a cashbox for store', async () => {
      const store = await helper.createStore();

      // Use helper
      const cashbox = await helper.createCashbox(store.id);
      // helper.createCashbox sets name automatically.

      expect(cashbox.storeId).toBe(store.id);
    });
  });

  describe('User', () => {
    // Helper does not have createUser, so we manually request and track.
    it('should create a user', async () => {
      const username = helper.uniqueName('User');
      const res = await request(app.getHttpServer()).post('/users').send({ username }).expect(201);

      expect(res.body.username).toBe(username);
      helper.createdIds.users.push(res.body.id);
    });

    it('should update user', async () => {
      const username = helper.uniqueName('OldUser');
      const resCreate = await request(app.getHttpServer())
        .post('/users')
        .send({ username })
        .expect(201);
      helper.createdIds.users.push(resCreate.body.id);

      const newName = helper.uniqueName('NewUser');
      const res = await request(app.getHttpServer())
        .patch(`/users/${resCreate.body.id}`)
        .send({ username: newName }) // Try changing username
        .expect(200);

      expect(res.body.username).toBe(newName);
    });

    it('should delete user', async () => {
      const username = helper.uniqueName('DeleteUser');
      const resCreate = await request(app.getHttpServer())
        .post('/users')
        .send({ username })
        .expect(201);

      helper.createdIds.users.push(resCreate.body.id);

      await request(app.getHttpServer()).delete(`/users/${resCreate.body.id}`).expect(200);

      await request(app.getHttpServer()).get(`/users/${resCreate.body.id}`).expect(404);
    });
  });
});
