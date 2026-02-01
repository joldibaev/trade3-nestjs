import { PrismaClient } from '../src/generated/prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';
import * as bcrypt from 'bcrypt';

const connectionString = `postgres://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}?schema=public`;

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.time('Total Seeding Time');
  console.log('Start seeding ...');

  // 0. User
  console.time('User');
  const passwordHash = await bcrypt.hash('123123123', 10);
  await prisma.user.upsert({
    where: { email: 'nurlan@joldibaev.uz' },
    update: { passwordHash },
    create: {
      email: 'nurlan@joldibaev.uz',
      passwordHash,
      role: 'ADMIN',
    },
  });
  console.timeEnd('User');

  // 1. PriceType (Тип цены)
  console.time('PriceTypes');
  await prisma.priceType.upsert({
    where: { name: 'Розничная' },
    update: {},
    create: { name: 'Розничная' },
  });
  await prisma.priceType.upsert({
    where: { name: 'Оптовая' },
    update: {},
    create: { name: 'Оптовая' },
  });
  console.timeEnd('PriceTypes');

  // 2. Stores and Cashboxes (Магазины и Кассы)
  console.time('Stores');
  const storesData = [
    {
      name: 'Канцтовары',
      address: 'ул. Пушкина, 10',
      phone: '+7 (700) 123-45-67',
      workingHours: '09:00 - 20:00',
      cashboxes: ['Касса 1 (Канцтовары)', 'Касса 2 (Канцтовары)'],
    },
    {
      name: 'Игрушки',
      address: 'пр. Абая, 45',
      phone: '+7 (700) 765-43-21',
      workingHours: '10:00 - 21:00',
      cashboxes: ['Касса 1 (Игрушки)', 'Касса 2 (Игрушки)'],
    },
  ];

  for (const storeData of storesData) {
    await prisma.store.upsert({
      where: { name: storeData.name },
      update: {
        address: storeData.address,
        phone: storeData.phone,
        workingHours: storeData.workingHours,
      },
      create: {
        name: storeData.name,
        address: storeData.address,
        phone: storeData.phone,
        workingHours: storeData.workingHours,
        cashboxes: {
          create: storeData.cashboxes.map((name) => ({ name })),
        },
      },
    });
  }
  console.timeEnd('Stores');

  // 3. Categories and Products
  console.time('Categories & Products');

  const categoriesData = [
    {
      name: 'Канцтовары',
      children: [
        {
          name: 'Письменные принадлежности',
          children: [
            {
              name: 'Ручки',
              products: [
                { name: 'Ручка шариковая Parker Jotter', barcode: '3501170947334' },
                { name: 'Ручка гелевая Pilot G-1', barcode: '4902505140359' },
                { name: 'Набор ручек BIC Cristal (4 шт)', barcode: '3086123304561' },
              ],
            },
            {
              name: 'Карандаши',
              products: [
                { name: 'Карандаш чернографитный Faber-Castell', barcode: '4005401190003' },
                { name: 'Цветные карандаши Koh-I-Noor (24 цвета)', barcode: '8593539097480' },
              ],
            },
          ],
        },
        {
          name: 'Бумажная продукция',
          children: [
            {
              name: 'Тетради',
              products: [
                { name: 'Тетрадь в клетку 12 листов', barcode: '4607106390012' },
                { name: 'Тетрадь 48 листов Bruno Visconti', barcode: '4602265089324' },
              ],
            },
          ],
        },
      ],
    },
    {
      name: 'Игрушки',
      children: [
        {
          name: 'Конструкторы',
          children: [
            {
              name: 'LEGO',
              products: [
                { name: 'LEGO Technic "McLaren Senna GTR"', barcode: '5702016912869' },
                { name: 'LEGO City "Полицейский участок"', barcode: '5702017161914' },
              ],
            },
            {
              name: 'Магнитные конструкторы',
              products: [{ name: 'Magformers Basic Set (30 деталей)', barcode: '8809465530113' }],
            },
          ],
        },
        {
          name: 'Мягкие игрушки',
          children: [
            {
              name: 'Плюшевые звери',
              products: [
                { name: 'Медведь Тедди (30 см)', barcode: '5034566370154' },
                { name: 'Заяц Mi (25 см)', barcode: '4627171440019' },
              ],
            },
          ],
        },
      ],
    },
  ];

  const processCategories = async (data: any, parentId?: string) => {
    const category = await prisma.category.upsert({
      where: { name: data.name },
      update: { parentId },
      create: {
        name: data.name,
        parentId,
      },
    });

    if (data.children) {
      for (const child of data.children) {
        await processCategories(child, category.id);
      }
    }

    if (data.products) {
      for (let i = 0; i < data.products.length; i++) {
        const prod = data.products[i];
        await prisma.product.upsert({
          where: {
            categoryId_name: {
              categoryId: category.id,
              name: prod.name,
            },
          },
          update: {},
          create: {
            name: prod.name,
            categoryId: category.id,
            code: `P-${category.name.substring(0, 3).toUpperCase()}-${i + 1}`,
            barcodes: {
              create: {
                value: prod.barcode,
              },
            },
          },
        });
      }
    }
  };

  for (const rootCat of categoriesData) {
    await processCategories(rootCat);
  }

  console.timeEnd('Categories & Products');

  // 4. Clients
  console.time('Clients');
  const clientsData = [
    { name: 'Розничный покупатель', phone: '0000000000' },
    { name: 'Иван Иванов', phone: '+7 (777) 111-22-33' },
  ];

  for (const client of clientsData) {
    await prisma.client.upsert({
      where: { name: client.name },
      update: { phone: client.phone },
      create: { name: client.name, phone: client.phone },
    });
  }
  console.timeEnd('Clients');

  // 5. Vendors
  console.time('Vendors');
  const vendorsData = [
    { name: 'ТОО КанцОпт', address: 'г. Алматы, ул. Складская, 5' },
    { name: 'Toy Importer Ltd', address: 'г. Астана, пр. Индустриальный, 12' },
  ];

  for (const vendor of vendorsData) {
    await prisma.vendor.upsert({
      where: { name: vendor.name },
      update: { address: vendor.address },
      create: { name: vendor.name, address: vendor.address },
    });
  }
  console.timeEnd('Vendors');

  console.log('Seeding finished.');
  console.timeEnd('Total Seeding Time');
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
