import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { TestHelper } from '../helpers/test-helper';
import { ZodValidationPipe } from 'nestjs-zod';
import fastifyCookie from '@fastify/cookie';
import { HttpAdapterHost } from '@nestjs/core';
import { HttpExceptionFilter } from '../../../src/common/filters/http-exception.filter';
import * as bcrypt from 'bcrypt';

describe('Authentication (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let helper: TestHelper;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    try {
      app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());

      const httpAdapterHost = app.get(HttpAdapterHost);
      app.useGlobalFilters(new HttpExceptionFilter(httpAdapterHost));
      app.useGlobalPipes(new ZodValidationPipe());

      await app.register(fastifyCookie);
      await app.init();
      await app.getHttpAdapter().getInstance().ready();

      prisma = app.get(PrismaService);
      helper = new TestHelper(app, prisma);
    } catch (e) {
      console.error('ERROR in beforeAll:', e);
      throw e;
    }
  });

  async function createUser(email: string, password = 'password123') {
    const passwordHash = await bcrypt.hash(password, 10);
    return prisma.user.create({
      data: {
        email,
        passwordHash,
      },
    });
  }

  afterAll(async () => {
    if (prisma) {
      try {
        await prisma.user.deleteMany({
          where: { email: { contains: 'test_auth_' } },
        });
      } catch (e) {
        console.error('Cleanup error:', e);
      }
    }
    if (app) {
      await app.close();
    }
  });

  describe('POST /auth/login', () => {
    const loginDto = {
      email: `test_auth_login_${Date.now()}@example.com`,
      password: 'password123',
    };

    beforeAll(async () => {
      await createUser(loginDto.email, loginDto.password);
    });

    it('should login and return tokens', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send(loginDto)
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.headers['set-cookie']).toBeDefined();
    });

    it('should not login with wrong password', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ ...loginDto, password: 'wrongpassword' })
        .expect(401);
    });
  });

  describe('POST /auth/refresh', () => {
    let refreshToken: string;

    beforeAll(async () => {
      const loginDto = {
        email: `test_auth_refresh_${Date.now()}@example.com`,
        password: 'password123',
      };
      await createUser(loginDto.email, loginDto.password);

      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send(loginDto)
        .expect(200);

      const cookie = loginRes.headers['set-cookie'].find((c: string) => c.includes('refreshToken'));
      refreshToken = cookie.split(';')[0].split('=')[1];
    });

    it('should refresh the access token', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', `refreshToken=${refreshToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
    });
  });

  describe('POST /auth/logout', () => {
    it('should clear the refresh token cookie', async () => {
      // Login first to get a token (though logout doesn't strictly check it as per guard update)
      const loginDto = {
        email: `test_auth_logout_${Date.now()}@example.com`,
        password: 'password123',
      };
      await createUser(loginDto.email, loginDto.password);

      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send(loginDto)
        .expect(200);

      const accessToken = loginRes.body.accessToken;

      const response = await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const cookie = response.headers['set-cookie'].find((c: string) => c.includes('refreshToken'));
      expect(cookie).toBeDefined();
    });
  });
});
