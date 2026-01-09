import { PrismaClient } from '../src/generated/prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

const connectionString = `postgres://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}?schema=public`;

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('--- Database Statistics ---');

  const stores = await prisma.store.count();
  const categories = await prisma.category.count();
  const products = await prisma.product.count();
  const prices = await prisma.price.count();
  const priceTypes = await prisma.priceType.count();

  console.log(`Stores:     ${stores}`);
  console.log(`Categories: ${categories}`);
  console.log(`Products:   ${products}`);
  console.log(`Prices:     ${prices}`);
  console.log(`PriceTypes: ${priceTypes}`);
  console.log('---------------------------');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
