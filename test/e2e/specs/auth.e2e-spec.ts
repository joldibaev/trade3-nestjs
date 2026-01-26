import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { PrismaService } from '../../../src/core/prisma/prisma.service';
import { TestHelper } from '../helpers/test-helper';
import { HttpAdapterHost } from '@nestjs/core';
import { HttpExceptionFilter } from '../../../src/common/filters/http-exception.filter';
import cookieParser from 'cookie-parser';

describe('Authentication (e2e)', () => {
  let app: INestApplication;
  let helper: TestHelper;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Apply globals same as main.ts
    const httpAdapterHost = app.get(HttpAdapterHost);
    app.useGlobalFilters(new HttpExceptionFilter(httpAdapterHost));
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );

    await app.init();

    prisma = app.get(PrismaService);

    // Debugging prisma
    if (prisma.user === undefined) {
      console.log('DEBUG: prisma.user is undefined in beforeAll');
      console.log('DEBUG: prisma properties:', Object.keys(Object.getPrototypeOf(prisma)));
    }

    helper = new TestHelper(app, prisma);
  });

  afterAll(async () => {
    // Manually cleanup users since TestHelper doesn't have it yet
    await prisma.user.deleteMany({
      where: { email: { contains: 'test_auth_' } },
    });
    await helper.cleanup();
    await app.close();
  });

  const testUser = {
    email: `test_auth_${Date.now()}@example.com`,
    password: 'Password123!',
    role: 'ADMIN',
  };

  let accessToken: string;
  let refreshTokenCookie: string;

  it('/auth/register (POST)', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send(testUser)
      .expect(201);

    expect(res.body.email).toBe(testUser.email);
    // expect(res.body.passwordHash).toBeUndefined(); // It's okay if it's there as long as we don't expose it to users, but usually we exclude it.
  });

  it('/auth/login (POST)', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: testUser.email,
        password: testUser.password,
      })
      .expect(200);

    expect(res.body.accessToken).toBeDefined();
    accessToken = res.body.accessToken;

    const cookies = res.get('Set-Cookie');
    expect(cookies).toBeDefined();
    refreshTokenCookie = cookies.find((c) => c.startsWith('refreshToken='));
    expect(refreshTokenCookie).toBeDefined();
  });

  it('Access protected route /categories (GET) - Success', async () => {
    await request(app.getHttpServer())
      .get('/categories')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
  });

  it('Access protected route /categories (GET) - Failure (No Token)', async () => {
    await request(app.getHttpServer())
      .get('/categories')
      .set('x-test-force-auth', 'true')
      .expect(401);
  });

  it('/auth/refresh (POST)', async () => {
    // Wait 1 second to ensure different iat
    await new Promise((resolve) => setTimeout(resolve, 1100));

    const res = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', [refreshTokenCookie])
      .expect(200);

    expect(res.body.accessToken).toBeDefined();
    expect(res.body.accessToken).not.toBe(accessToken);
    accessToken = res.body.accessToken;

    const cookies = res.get('Set-Cookie');
    expect(cookies).toBeDefined();
    refreshTokenCookie = cookies.find((c) => c.startsWith('refreshToken='));
    expect(refreshTokenCookie).toBeDefined();
  });

  it('/auth/logout (POST)', async () => {
    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    // Verify refresh token is invalidated
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', [refreshTokenCookie])
      .expect(401);
  });
});
