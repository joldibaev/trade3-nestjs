import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { PrismaService } from '../../../src/core/prisma/prisma.service';
import { TestHelper } from '../helpers/test-helper';
import { HttpAdapterHost } from '@nestjs/core';
import { HttpExceptionFilter } from '../../../src/common/filters/http-exception.filter';

describe('Master Data - Partners (e2e)', () => {
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

  describe('Vendor', () => {
    it('should create a vendor', async () => {
      const name = helper.uniqueName('Vendor');
      const res = await request(app.getHttpServer())
        .post('/vendors')
        .send({ name, email: 'vendor@example.com' })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.name).toBe(name);
      helper.createdIds.vendors.push(res.body.id);
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

      await request(app.getHttpServer()).delete(`/vendors/${vendor.id}`).expect(200); // Controller likely returns 200 via @ApiStandardResponse

      await request(app.getHttpServer()).get(`/vendors/${vendor.id}`).expect(404);
    });
  });

  describe('Client', () => {
    it('should create a client', async () => {
      const name = helper.uniqueName('Client');
      const res = await request(app.getHttpServer())
        .post('/clients')
        .send({ name, address: '123 Main St' })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.name).toBe(name);
      helper.createdIds.clients.push(res.body.id);
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
