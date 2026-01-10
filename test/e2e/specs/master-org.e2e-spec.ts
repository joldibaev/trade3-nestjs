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
    await app.close();
  });

  beforeEach(async () => {
    await helper.cleanup();
  });

  describe('Store', () => {
    it('should create a store', async () => {
      const name = helper.uniqueName('Store');
      const res = await request(app.getHttpServer()).post('/stores').send({ name }).expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.name).toBe(name);
      helper.createdIds.stores.push(res.body.id);
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
      const name = helper.uniqueName('Cashbox');

      const res = await request(app.getHttpServer())
        .post('/cashboxes') // Note: Assuming plural 'cashboxes'
        // I need to check controller path? Class was 'CashboxController', usually 'cashboxes'.
        .send({ name, storeId: store.id })
        .expect(201);

      expect(res.body.name).toBe(name);
      expect(res.body.storeId).toBe(store.id);
      helper.createdIds.cashboxes.push(res.body.id);
    });
  });

  describe('User', () => {
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
      helper.createdIds.users.push(resCreate.body.id); // Track manually as test helper lacks createUser

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

      // We don't necessarily need to track it if we delete it successfully,
      // but tracking is safer in case delete fails.
      helper.createdIds.users.push(resCreate.body.id);

      await request(app.getHttpServer()).delete(`/users/${resCreate.body.id}`).expect(200);

      await request(app.getHttpServer()).get(`/users/${resCreate.body.id}`).expect(404);
    });
  });
});
