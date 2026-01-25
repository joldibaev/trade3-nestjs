import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../../src/app.module';
import { PrismaService } from '../../../src/core/prisma/prisma.service';

describe('Global Cleanup Verification (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('should have a clean database (no garbage data)', async () => {
    const tables = ['store', 'cashbox', 'vendor', 'client', 'product', 'category', 'priceType'];

    let garbageFound = false;
    const details: string[] = [];

    for (const table of tables) {
      const records = await (prisma[table] as any).findMany({
        where: {
          OR: [
            { name: { contains: 'Store_' } },
            { name: { contains: 'Cashbox_' } },
            { name: { contains: 'Vendor_' } },
            { name: { contains: 'Client_' } },
            { name: { contains: 'Product_' } },
            { name: { contains: 'Category_' } },
            { name: { contains: 'Retail_' } },
            { name: { contains: 'Wholesale_' } },
            { name: { contains: 'User_' } },
            { name: { contains: 'MIXED Case Product' } },
          ],
        },
      });

      if (records.length > 0) {
        console.error(
          `GARBAGE FOUND in ${table}:`,
          records.map((r) => r.name || r.id),
        );
        garbageFound = true;
        details.push(`${table}: ${records.length} records`);
      }
    }

    // Special check for DocumentPriceChange (no name field)
    const priceChanges = await prisma.documentPriceChange.findMany({
      where: {
        OR: [
          { notes: { contains: 'Initial pricing' } },
          { notes: { contains: 'Автоматически создан' } },
        ],
      },
    });

    if (priceChanges.length > 0) {
      console.error(
        `GARBAGE FOUND in documentPriceChange:`,
        priceChanges.map((r) => r.id),
      );
      garbageFound = true;
      details.push(`documentPriceChange: ${priceChanges.length} records`);
    }

    if (garbageFound) {
      throw new Error(`Garbage data detected in: ${details.join(', ')}`);
    }
  });
});
