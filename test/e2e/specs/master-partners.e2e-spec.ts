import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyCookie from '@fastify/cookie';
import { ZodValidationPipe } from 'nestjs-zod';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { TestHelper } from '../helpers/test-helper';
import { HttpAdapterHost } from '@nestjs/core';
import { HttpExceptionFilter } from '../../../src/common/filters/http-exception.filter';

describe('Master Data - Partners (e2e)', () => {
  let app: NestFastifyApplication;
  let helper: TestHelper;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.register(fastifyCookie);
    app.useGlobalPipes(new ZodValidationPipe());

    // Apply globals
    const httpAdapterHost = app.get(HttpAdapterHost);
    app.useGlobalFilters(new HttpExceptionFilter(httpAdapterHost));

    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const prismaService = app.get(PrismaService);
    helper = new TestHelper(app, prismaService);
  });

  afterAll(async () => {
    await helper?.cleanup();
    await app.close();
  });

  describe('Vendor', () => {
    it('should create a vendor', async () => {
      const name = helper.uniqueName('Vendor');

      // Use helper
      // TestHelper.createVendor takes 0 args and uses random name.
      // But we can update it or accept random name.
      // Or manually create and push ID.
      // Let's use helper for standard creation.

      const vendor = await helper.createVendor();
      expect(vendor.id).toBeDefined();
    });

    it('should update vendor', async () => {
      const vendor = await helper.createVendor();

      const res = await request(app.getHttpServer())
        .patch(`/vendors/${vendor.id}`)
        .send({ phone: '555-1234' })
        .expect(200);

      expect(res.body.phone).toBe('555-1234');
    });

    it('should delete vendor', async () => {
      const vendor = await helper.createVendor();

      await request(app.getHttpServer()).delete(`/vendors/${vendor.id}`).expect(200);

      await request(app.getHttpServer()).get(`/vendors/${vendor.id}`).expect(404);
    });
  });

  describe('Client', () => {
    it('should create a client', async () => {
      // Use helper
      const client = await helper.createClient();
      expect(client.id).toBeDefined();
    });

    it('should update client', async () => {
      const client = await helper.createClient();

      const res = await request(app.getHttpServer())
        .patch(`/clients/${client.id}`)
        .send({ email: 'client@example.com' })
        .expect(200);

      expect(res.body.email).toBe('client@example.com');
    });

    it('should delete client', async () => {
      const client = await helper.createClient();

      await request(app.getHttpServer()).delete(`/clients/${client.id}`).expect(200);

      await request(app.getHttpServer()).get(`/clients/${client.id}`).expect(404);
    });
  });
});
