
import { PrismaClient } from '../src/generated/prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

const connectionString = `postgres://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}?schema=public`;

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
    console.time('Total Seeding Time');
    console.log('Start seeding ...');

    // 1. PriceType (Тип цены)
    console.time('PriceType');
    const retailPriceType = await prisma.priceType.upsert({
        where: { name: 'Розничная' },
        update: {},
        create: { name: 'Розничная' },
    });
    console.timeEnd('PriceType');

    // 2. Stores and Cashboxes (Магазины и Кассы)
    console.time('Stores');
    const storesData = [
        { name: 'Канцтовары', cashbox: 'Основная Касса (Канцтовары)' },
        { name: 'Игрушки', cashbox: 'Основная Касса (Игрушки)' },
    ];

    for (const storeData of storesData) {
        await prisma.store.upsert({
            where: { name: storeData.name },
            update: {},
            create: {
                name: storeData.name,
                cashboxes: {
                    create: { name: storeData.cashbox },
                },
            },
        });
    }
    console.timeEnd('Stores');

    // Helper to create products
    const createProducts = async (categoryId: string, categoryName: string, prefix: string, count: number) => {
        const products: any[] = [];
        for (let i = 1; i <= count; i++) {
            const productName = `${prefix} ${categoryName} ${i}`;
            products.push(
                prisma.product.upsert({
                    where: {
                        categoryId_name: {
                            categoryId,
                            name: productName,
                        },
                    },
                    update: {},
                    create: {
                        name: productName,
                        categoryId,
                        prices: {
                            create: {
                                value: Math.floor(Math.random() * 1000) + 50, // Random price 50-1050
                                priceTypeId: retailPriceType.id,
                            },
                        },
                    },
                })
            );
        }
        await Promise.all(products); // Parallelize product creation
    };

    // 3. Categories and Products Hierarchy
    console.time('Categories & Products');

    const categoriesData = [
        {
            name: 'Канцтовары (Категория)',
            children: [
                {
                    name: 'Письменные принадлежности', children: [
                        { name: 'Ручки', productPrefix: 'Крутая' },
                        { name: 'Карандаши', productPrefix: 'Простой' },
                        { name: 'Маркеры', productPrefix: 'Яркий' }
                    ]
                },
                {
                    name: 'Бумажная продукция', children: [
                        { name: 'Тетради', productPrefix: 'Тетрадь' },
                        { name: 'Блокноты', productPrefix: 'Блокнот' },
                        { name: 'Стикеры', productPrefix: 'Набор' }
                    ]
                },
                {
                    name: 'Офисные мелочи', children: [
                        { name: 'Степлеры', productPrefix: 'Степлер' },
                        { name: 'Скрепки', productPrefix: 'Упаковка' },
                        { name: 'Папки', productPrefix: 'Папка' }
                    ]
                }
            ]
        },
        {
            name: 'Все игрушки',
            children: [
                {
                    name: 'Мягкие игрушки', children: [
                        { name: 'Мишки', productPrefix: 'Мишка' },
                        { name: 'Зайчики', productPrefix: 'Заяц' },
                        { name: 'Котики', productPrefix: 'Кот' }
                    ]
                },
                {
                    name: 'Конструкторы', children: [
                        { name: 'Lego-like', productPrefix: 'Набор' },
                        { name: 'Магнитные', productPrefix: 'Магнит' },
                        { name: 'Деревянные', productPrefix: 'Брусочки' }
                    ]
                },
                {
                    name: 'Развивающие', children: [
                        { name: 'Пазлы', productPrefix: 'Пазл' },
                        { name: 'Настольные игры', productPrefix: 'Игра' },
                        { name: 'Наборы для творчества', productPrefix: 'Набор' }
                    ]
                }
            ]
        }
    ];

    // Recursive function to process categories
    const processCategories = async (data: any, parentId?: string) => {
        // Create current category
        const category = await prisma.category.upsert({
            where: { name: data.name },
            update: { parentId }, // Update parent connection if needed
            create: {
                name: data.name,
                parentId,
            },
        });

        // If it has children, recurse
        if (data.children && data.children.length > 0) {
            for (const child of data.children) {
                await processCategories(child, category.id);
            }
        } else {
            // It's a leaf node (in this structure), generate products
            // Use explicitly provided prefix or just category name
            const prefix = data.productPrefix || 'Товар';
            await createProducts(category.id, data.name, prefix, 12); // Create 12 products per leaf category
        }
    };

    for (const rootCat of categoriesData) {
        await processCategories(rootCat);
    }

    console.timeEnd('Categories & Products');

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
    });
