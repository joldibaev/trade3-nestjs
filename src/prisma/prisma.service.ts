import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

import { PrismaClient } from '../generated/prisma/client';

@Injectable()
export class PrismaService extends PrismaClient {
  constructor(private readonly configService: ConfigService) {
    const DB_USER = configService.getOrThrow<string>('DB_USER');
    const DB_PASSWORD = configService.getOrThrow<string>('DB_PASSWORD');
    const DB_HOST = configService.getOrThrow<string>('DB_HOST');
    const DB_PORT = configService.getOrThrow<string>('DB_PORT');
    const DB_NAME = configService.getOrThrow<string>('DB_NAME');

    const connectionString = `postgres://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?schema=public`;
    const pool = new Pool({ connectionString });

    const adapter = new PrismaPg(pool);
    super({ adapter });
  }
}
