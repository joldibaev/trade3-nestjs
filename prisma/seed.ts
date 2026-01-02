import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const { DB_USER, DB_PASSWORD, DB_HOST, DB_PORT, DB_NAME } = process.env;
const connectionString = `postgres://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?schema=public`;

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function createStores() {
  await prisma.store.upsert({
    where: { name: 'Cosmos' },
    update: {},
    create: {
      name: 'Cosmos',
      cashboxes: {
        create: {
          name: 'Касса-1',
        },
      },
    },
  });
}

async function createPriceTypes() {
  const types = ['Оптовая цена', 'Розничная цена'];
  for (const name of types) {
    await prisma.priceType.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
}

async function createCategories() {
  const retailPriceType = await prisma.priceType.findUniqueOrThrow({
    where: { name: 'Розничная цена' },
  });
  const wholesalePriceType = await prisma.priceType.findUniqueOrThrow({
    where: { name: 'Оптовая цена' },
  });

  const categoriesData = [
    {
      name: 'Ручки',
      products: [
        { name: 'Schneider XTRA 823', retail: 15000, wholesale: 12000 },
        { name: 'Deli EQ19-BL', retail: 5000, wholesale: 4000 },
        { name: 'Lazor Starline 0,6мм синяя Linc', retail: 3000, wholesale: 2500 },
      ],
    },
    {
      name: 'Тетрадь',
      products: [
        { name: 'Тетрадь 12л', retail: 1200, wholesale: 1000 },
        { name: 'Тетрадь 36л', retail: 2500, wholesale: 2100 },
        { name: 'Тетрадь 48л', retail: 3500, wholesale: 3000 },
        { name: 'Тетрадь 96л', retail: 6000, wholesale: 5200 },
      ],
    },
  ];

  for (const catData of categoriesData) {
    const category = await prisma.category.upsert({
      where: { name: catData.name },
      update: {},
      create: { name: catData.name },
    });

    for (const prodData of catData.products) {
      await prisma.product.upsert({
        where: {
          categoryId_name: {
            categoryId: category.id,
            name: prodData.name,
          },
        },
        update: {},
        create: {
          name: prodData.name,
          categoryId: category.id,
          prices: {
            create: [
              {
                value: prodData.retail,
                priceTypeId: retailPriceType.id,
              },
              {
                value: prodData.wholesale,
                priceTypeId: wholesalePriceType.id,
              },
            ],
          },
        },
      });
    }
  }
}

async function createVendors() {
  const vendors = ['GiftHouse', 'Урикзор 21'];
  for (const name of vendors) {
    await prisma.vendor.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
}

async function createClients() {
  const clients = ['Гунча'];
  for (const name of clients) {
    await prisma.client.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
}

async function main() {
  console.log('🌱 Seeding database...');
  await createStores();
  await createPriceTypes();
  await createCategories();
  await createVendors();
  await createClients();
  console.log('✅ Seeding complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
