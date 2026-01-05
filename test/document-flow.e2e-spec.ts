import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, BadRequestException } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { DocumentPurchaseService } from '../src/document-purchase/document-purchase.service';
import { DocumentSaleService } from '../src/document-sale/document-sale.service';
import { DocumentReturnService } from '../src/document-return/document-return.service';
import { DocumentAdjustmentService } from '../src/document-adjustment/document-adjustment.service';
import { DocumentTransferService } from '../src/document-transfer/document-transfer.service';
import { StoreService } from '../src/store/store.service';
import { CashboxService } from '../src/cashbox/cashbox.service';
import { PriceTypeService } from '../src/pricetype/pricetype.service';
import { ProductService } from '../src/product/product.service';
import { VendorService } from '../src/vendor/vendor.service';
import { ClientService } from '../src/client/client.service';
import { CategoryService } from '../src/category/category.service';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { Prisma } from '../src/generated/prisma/client';
import Decimal = Prisma.Decimal;

describe('Document Flow (e2e)', () => {
  let app: INestApplication;
  let prismaService: PrismaService;
  let documentPurchaseService: DocumentPurchaseService;
  let documentSaleService: DocumentSaleService;
  let storeService: StoreService;
  let cashboxService: CashboxService;
  let priceTypeService: PriceTypeService;
  let productService: ProductService;
  let vendorService: VendorService;
  let clientService: ClientService;
  let categoryService: CategoryService;
  let documentReturnService: DocumentReturnService;
  let documentAdjustmentService: DocumentAdjustmentService;
  let documentTransferService: DocumentTransferService;

  // Tracking created entities for cleanup
  const createdIds = {
    stores: [] as string[],
    cashboxes: [] as string[],
    vendors: [] as string[],
    clients: [] as string[],
    priceTypes: [] as string[],
    categories: [] as string[],
    products: [] as string[],
    purchases: [] as string[],
    sales: [] as string[],
    returns: [] as string[],
    adjustments: [] as string[],
    transfers: [] as string[],
    stocks: [] as string[],
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prismaService = app.get(PrismaService);
    documentPurchaseService = moduleFixture.get<DocumentPurchaseService>(
      DocumentPurchaseService,
    );
    documentSaleService =
      moduleFixture.get<DocumentSaleService>(DocumentSaleService);
    storeService = moduleFixture.get<StoreService>(StoreService);
    cashboxService = moduleFixture.get<CashboxService>(CashboxService);
    priceTypeService = moduleFixture.get<PriceTypeService>(PriceTypeService);
    productService = moduleFixture.get<ProductService>(ProductService);
    vendorService = moduleFixture.get<VendorService>(VendorService);
    clientService = moduleFixture.get<ClientService>(ClientService);
    categoryService = moduleFixture.get<CategoryService>(CategoryService);
    documentReturnService = moduleFixture.get<DocumentReturnService>(
      DocumentReturnService,
    );
    documentAdjustmentService = moduleFixture.get<DocumentAdjustmentService>(
      DocumentAdjustmentService,
    );
    documentTransferService = moduleFixture.get<DocumentTransferService>(
      DocumentTransferService,
    );
  });

  afterAll(async () => {
    // Cleanup all created entities in reverse order
    await cleanupCreatedEntities();
    await prismaService.$disconnect();
    await app.close();
  });

  // Helper: Generate unique name with timestamp
  const uniqueName = (prefix: string) => {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  };

  // Helper: Cleanup all created entities
  const cleanupCreatedEntities = async () => {
    // Delete in reverse order of creation to respect foreign keys
    if (createdIds.sales.length > 0) {
      await prismaService.documentSaleItem.deleteMany({
        where: { saleId: { in: createdIds.sales } },
      });
      await prismaService.documentSale.deleteMany({
        where: { id: { in: createdIds.sales } },
      });
    }

    if (createdIds.returns.length > 0) {
      await prismaService.documentReturnItem.deleteMany({
        where: { returnId: { in: createdIds.returns } },
      });
      await prismaService.documentReturn.deleteMany({
        where: { id: { in: createdIds.returns } },
      });
    }

    if (createdIds.adjustments.length > 0) {
      await prismaService.documentAdjustmentItem.deleteMany({
        where: { adjustmentId: { in: createdIds.adjustments } },
      });
      await prismaService.documentAdjustment.deleteMany({
        where: { id: { in: createdIds.adjustments } },
      });
    }

    if (createdIds.transfers.length > 0) {
      await prismaService.documentTransferItem.deleteMany({
        where: { transferId: { in: createdIds.transfers } },
      });
      await prismaService.documentTransfer.deleteMany({
        where: { id: { in: createdIds.transfers } },
      });
    }

    if (createdIds.purchases.length > 0) {
      await prismaService.documentPurchaseItem.deleteMany({
        where: { purchaseId: { in: createdIds.purchases } },
      });
      await prismaService.documentPurchase.deleteMany({
        where: { id: { in: createdIds.purchases } },
      });
    }

    if (createdIds.products.length > 0) {
      // Delete all stocks for these products
      await prismaService.stock.deleteMany({
        where: { productId: { in: createdIds.products } },
      });
      await prismaService.price.deleteMany({
        where: { productId: { in: createdIds.products } },
      });
      await prismaService.barcode.deleteMany({
        where: { productId: { in: createdIds.products } },
      });
      await prismaService.product.deleteMany({
        where: { id: { in: createdIds.products } },
      });
    }

    if (createdIds.categories.length > 0) {
      await prismaService.category.deleteMany({
        where: { id: { in: createdIds.categories } },
      });
    }

    if (createdIds.cashboxes.length > 0) {
      await prismaService.cashbox.deleteMany({
        where: { id: { in: createdIds.cashboxes } },
      });
    }

    if (createdIds.stores.length > 0) {
      await prismaService.store.deleteMany({
        where: { id: { in: createdIds.stores } },
      });
    }

    if (createdIds.clients.length > 0) {
      await prismaService.client.deleteMany({
        where: { id: { in: createdIds.clients } },
      });
    }

    if (createdIds.vendors.length > 0) {
      await prismaService.vendor.deleteMany({
        where: { id: { in: createdIds.vendors } },
      });
    }

    if (createdIds.priceTypes.length > 0) {
      await prismaService.priceType.deleteMany({
        where: { id: { in: createdIds.priceTypes } },
      });
    }
  };

  // Helper: Create test store
  const createTestStore = async () => {
    const store = await storeService.create({ name: uniqueName('Store') });
    createdIds.stores.push(store.id);
    return store;
  };

  // Helper: Create test cashbox
  const createTestCashbox = async (storeId: string) => {
    const cashbox = await cashboxService.create({
      name: uniqueName('Cashbox'),
      storeId,
    });
    createdIds.cashboxes.push(cashbox.id);
    return cashbox;
  };

  // Helper: Create test vendor
  const createTestVendor = async () => {
    const vendor = await vendorService.create({ name: uniqueName('Vendor') });
    createdIds.vendors.push(vendor.id);
    return vendor;
  };

  // Helper: Create test client
  const createTestClient = async () => {
    const client = await clientService.create({ name: uniqueName('Client') });
    createdIds.clients.push(client.id);
    return client;
  };

  // Helper: Create test price types
  const createTestPriceTypes = async () => {
    const retail = await priceTypeService.create({
      name: uniqueName('Retail'),
    });
    const wholesale = await priceTypeService.create({
      name: uniqueName('Wholesale'),
    });
    createdIds.priceTypes.push(retail.id, wholesale.id);
    return { retail, wholesale };
  };

  // Helper: Create test category
  const createTestCategory = async () => {
    const category = await categoryService.create({
      name: uniqueName('Category'),
    });
    createdIds.categories.push(category.id);
    return category;
  };

  // Helper: Create test product
  const createTestProduct = async (categoryId: string) => {
    const product = await productService.create({
      name: uniqueName('Product'),
      categoryId,
    });
    createdIds.products.push(product.id);
    return product;
  };

  // Helper: Get stock
  const getStock = async (productId: string, storeId: string) => {
    const stock = await prismaService.stock.findUnique({
      where: {
        productId_storeId: { productId, storeId },
      },
    });
    if (stock && !createdIds.stocks.includes(stock.id)) {
      createdIds.stocks.push(stock.id);
    }
    return stock;
  };

  // Helper: Expect stock values
  const expectStock = async (
    productId: string,
    storeId: string,
    expectedQty: string,
    expectedWAP: string,
  ) => {
    const stock = await getStock(productId, storeId);
    expect(stock).toBeDefined();
    expect(stock!.quantity.toString()).toBe(expectedQty);
    // Use toFixed(2) for WAP comparison to avoid precision issues
    expect(stock!.averagePurchasePrice.toFixed(2)).toBe(
      new Decimal(expectedWAP).toFixed(2),
    );
  };

  // Helper: Create purchase
  const createPurchase = async (
    storeId: string,
    vendorId: string,
    productId: string,
    quantity: number,
    price: number,
  ) => {
    const date = new Date();
    date.setHours(10, 0, 0, 0);

    const purchase = await documentPurchaseService.create({
      storeId,
      vendorId,
      date: date.toISOString(),
      status: 'COMPLETED',
      items: [{ productId, quantity, price }],
    });
    createdIds.purchases.push(purchase.id);
    return purchase;
  };

  // Helper: Create sale
  const createSale = async (
    storeId: string,
    cashboxId: string,
    priceTypeId: string,
    productId: string,
    quantity: number,
    price: number,
    clientId?: string,
  ) => {
    const date = new Date();
    date.setHours(14, 0, 0, 0);

    const sale = await documentSaleService.create({
      storeId,
      cashboxId,
      clientId,
      priceTypeId,
      date: date.toISOString(),
      status: 'COMPLETED',
      items: [{ productId, quantity, price }],
    });
    createdIds.sales.push(sale.id);
    return sale;
  };

  describe('Basic Purchase Flow', () => {
    // Тест 1: Проверяет создание записи Stock при первой закупке товара
    // Ожидается: quantity = 10, WAP = 5000
    it('should create stock on first purchase', async () => {
      const store = await createTestStore();
      const vendor = await createTestVendor();
      const category = await createTestCategory();
      const product = await createTestProduct(category.id);

      const purchase = await createPurchase(
        store.id,
        vendor.id,
        product.id,
        10,
        5000,
      );

      expect(purchase.totalAmount.toString()).toBe('50000');
      await expectStock(product.id, store.id, '10', '5000');
    });

    // Тест 2: Проверяет обновление остатков при повторной закупке по той же цене
    // Ожидается: quantity увеличивается (10 + 5 = 15), WAP остается 5000
    it('should update stock on second purchase with same price', async () => {
      const store = await createTestStore();
      const vendor = await createTestVendor();
      const category = await createTestCategory();
      const product = await createTestProduct(category.id);

      await createPurchase(store.id, vendor.id, product.id, 10, 5000);
      await createPurchase(store.id, vendor.id, product.id, 5, 5000);

      await expectStock(product.id, store.id, '15', '5000');
    });

    // Тест 3: Проверяет расчет средневзвешенной цены (WAP) при закупке по другой цене
    // Формула WAP: (старое_кол-во * старая_цена + новое_кол-во * новая_цена) / общее_кол-во
    // Current: 15 @ 5000 = 75,000
    // New: 10 @ 6000 = 60,000
    // Total: 25 @ (75,000 + 60,000) / 25 = 5,400
    it('should calculate WAP on purchase with different price', async () => {
      const store = await createTestStore();
      const vendor = await createTestVendor();
      const category = await createTestCategory();
      const product = await createTestProduct(category.id);

      await createPurchase(store.id, vendor.id, product.id, 15, 5000);
      await createPurchase(store.id, vendor.id, product.id, 10, 6000);

      await expectStock(product.id, store.id, '25', '5400');
    });
  });

  describe('Basic Sale Flow', () => {
    // Тест 4: Проверяет уменьшение остатков при продаже
    // Ожидается: quantity уменьшается (25 - 5 = 20), WAP не меняется
    it('should decrease stock on sale', async () => {
      const store = await createTestStore();
      const cashbox = await createTestCashbox(store.id);
      const vendor = await createTestVendor();
      const category = await createTestCategory();
      const product = await createTestProduct(category.id);
      const { retail } = await createTestPriceTypes();

      await createPurchase(store.id, vendor.id, product.id, 25, 5400);
      await createSale(store.id, cashbox.id, retail.id, product.id, 5, 7000);

      await expectStock(product.id, store.id, '20', '5400');
    });

    // Тест 5: Проверяет последовательные продажи
    // Ожидается: quantity уменьшается после каждой продажи, WAP остается неизменным
    it('should handle multiple sales', async () => {
      const store = await createTestStore();
      const cashbox = await createTestCashbox(store.id);
      const vendor = await createTestVendor();
      const category = await createTestCategory();
      const product = await createTestProduct(category.id);
      const { retail, wholesale } = await createTestPriceTypes();

      await createPurchase(store.id, vendor.id, product.id, 20, 5400);

      await createSale(store.id, cashbox.id, retail.id, product.id, 3, 7000);
      await expectStock(product.id, store.id, '17', '5400');

      await createSale(store.id, cashbox.id, wholesale.id, product.id, 2, 6000);
      await expectStock(product.id, store.id, '15', '5400');
    });

    // Тест 6: Проверяет, что продажа НЕ влияет на среднюю закупочную цену
    // Важно: WAP меняется только при закупках, не при продажах
    it('should not change WAP on sale', async () => {
      const store = await createTestStore();
      const cashbox = await createTestCashbox(store.id);
      const vendor = await createTestVendor();
      const category = await createTestCategory();
      const product = await createTestProduct(category.id);
      const { retail } = await createTestPriceTypes();

      await createPurchase(store.id, vendor.id, product.id, 10, 5000);

      const stockBefore = await getStock(product.id, store.id);
      await createSale(store.id, cashbox.id, retail.id, product.id, 1, 10000);
      const stockAfter = await getStock(product.id, store.id);

      expect(stockAfter!.averagePurchasePrice.toFixed(2)).toBe(
        stockBefore!.averagePurchasePrice.toFixed(2),
      );
    });

    // Тест 7: Проверяет, что costPrice в DocumentSaleItem правильно заполняется из Stock
    // Ожидается: costPrice равен averagePurchasePrice из Stock на момент продажи
    it('should set costPrice from stock averagePurchasePrice', async () => {
      const store = await createTestStore();
      const cashbox = await createTestCashbox(store.id);
      const vendor = await createTestVendor();
      const category = await createTestCategory();
      const product = await createTestProduct(category.id);
      const { retail } = await createTestPriceTypes();

      // Create purchase with known price
      await createPurchase(store.id, vendor.id, product.id, 10, 5000);
      const stock = await getStock(product.id, store.id);
      expect(stock).toBeDefined();
      const expectedCostPrice = stock!.averagePurchasePrice;

      // Create sale
      const sale = await createSale(
        store.id,
        cashbox.id,
        retail.id,
        product.id,
        3,
        7000,
      );

      // Verify costPrice is set correctly in the sale item
      expect(sale.items).toBeDefined();
      expect(sale.items.length).toBe(1);
      expect(sale.items[0].costPrice.toFixed(2)).toBe(
        expectedCostPrice.toFixed(2),
      );

      // Verify costPrice is persisted in database
      const saleFromDb = await documentSaleService.findOne(sale.id, {
        items: true,
      });
      expect(saleFromDb.items[0].costPrice.toFixed(2)).toBe(
        expectedCostPrice.toFixed(2),
      );
    });
  });

  describe('WAP Calculation Edge Cases', () => {
    // Тест 7: Проверяет корректную обработку нулевого остатка
    // Ожидается: quantity = 0, но WAP сохраняется для истории
    it('should handle zero quantity correctly', async () => {
      const store = await createTestStore();
      const cashbox = await createTestCashbox(store.id);
      const vendor = await createTestVendor();
      const category = await createTestCategory();
      const product = await createTestProduct(category.id);
      const { retail } = await createTestPriceTypes();

      await createPurchase(store.id, vendor.id, product.id, 10, 1000);
      await createSale(store.id, cashbox.id, retail.id, product.id, 10, 2000);

      const stock = await getStock(product.id, store.id);
      expect(stock!.quantity.toString()).toBe('0');
      expect(stock!.averagePurchasePrice.toString()).toBe('1000');
    });

    // Тест 8: Проверяет пополнение товара после полной распродажи
    // Ожидается: WAP пересчитывается на основе новой закупки
    it('should calculate WAP after restocking from zero', async () => {
      const store = await createTestStore();
      const cashbox = await createTestCashbox(store.id);
      const vendor = await createTestVendor();
      const category = await createTestCategory();
      const product = await createTestProduct(category.id);
      const { retail } = await createTestPriceTypes();

      await createPurchase(store.id, vendor.id, product.id, 10, 1000);
      await createSale(store.id, cashbox.id, retail.id, product.id, 10, 2000);
      // Stock is 0 @ 1000
      await createPurchase(store.id, vendor.id, product.id, 20, 1500);

      // WAP = (0 * 1000 + 20 * 1500) / 20 = 1500
      await expectStock(product.id, store.id, '20', '1500');
    });

    // Тест 9: Проверяет сложный сценарий с множественными операциями и пересчетом WAP
    // Симулирует реальный бизнес-процесс: закупка -> продажа -> новая закупка
    it('should handle complex WAP calculation', async () => {
      const store = await createTestStore();
      const cashbox = await createTestCashbox(store.id);
      const vendor = await createTestVendor();
      const category = await createTestCategory();
      const product = await createTestProduct(category.id);
      const { retail } = await createTestPriceTypes();

      // Current: 20 @ 1500 = 30,000
      await createPurchase(store.id, vendor.id, product.id, 20, 1500);
      await createPurchase(store.id, vendor.id, product.id, 30, 1200); // +36,000
      // Total: 50 @ 66,000 / 50 = 1320
      await expectStock(product.id, store.id, '50', '1320');

      await createSale(store.id, cashbox.id, retail.id, product.id, 15, 2000);
      await expectStock(product.id, store.id, '35', '1320');

      await createPurchase(store.id, vendor.id, product.id, 15, 1800); // +27,000
      // Total: 50 @ (35*1320 + 15*1800) / 50 = (46,200 + 27,000) / 50 = 1464
      await expectStock(product.id, store.id, '50', '1464');
    });
  });

  describe('Multi-Product Transactions', () => {
    // Тест 10: Проверяет создание документа закупки с несколькими товарами
    // Ожидается: правильный расчет общей суммы и создание всех позиций
    it('should handle purchase with multiple products', async () => {
      const store = await createTestStore();
      const vendor = await createTestVendor();
      const category = await createTestCategory();
      const product1 = await createTestProduct(category.id);
      const product2 = await createTestProduct(category.id);

      const date = new Date();
      date.setHours(10, 0, 0, 0);

      const purchase = await documentPurchaseService.create({
        storeId: store.id,
        vendorId: vendor.id,
        date: date.toISOString(),
        status: 'COMPLETED',
        items: [
          { productId: product1.id, quantity: 5, price: 5000 },
          { productId: product2.id, quantity: 10, price: 1000 },
        ],
      });
      createdIds.purchases.push(purchase.id);

      expect(purchase.totalAmount.toString()).toBe('35000'); // 25,000 + 10,000
      expect(purchase.items.length).toBe(2);
    });

    // Тест 11: Проверяет создание документа продажи с несколькими товарами
    // Ожидается: правильный расчет общей суммы и обновление остатков для всех товаров
    it('should handle sale with multiple products', async () => {
      const store = await createTestStore();
      const cashbox = await createTestCashbox(store.id);
      const vendor = await createTestVendor();
      const category = await createTestCategory();
      const product1 = await createTestProduct(category.id);
      const product2 = await createTestProduct(category.id);
      const { retail } = await createTestPriceTypes();

      // Create stock first
      await createPurchase(store.id, vendor.id, product1.id, 10, 5000);
      await createPurchase(store.id, vendor.id, product2.id, 20, 1000);

      const date = new Date();
      date.setHours(14, 0, 0, 0);

      const sale = await documentSaleService.create({
        storeId: store.id,
        cashboxId: cashbox.id,
        priceTypeId: retail.id,
        date: date.toISOString(),
        status: 'COMPLETED',
        items: [
          { productId: product1.id, quantity: 2, price: 7000 },
          { productId: product2.id, quantity: 5, price: 2000 },
        ],
      });
      createdIds.sales.push(sale.id);

      expect(sale.totalAmount.toString()).toBe('24000'); // 14,000 + 10,000
      expect(sale.items.length).toBe(2);
    });
  });

  describe('Price Type Handling', () => {
    // Тест 12: Проверяет продажу по розничной цене с указанием клиента
    // Ожидается: правильный тип цены и привязка к клиенту
    it('should use correct price for retail sale', async () => {
      const store = await createTestStore();
      const cashbox = await createTestCashbox(store.id);
      const vendor = await createTestVendor();
      const client = await createTestClient();
      const category = await createTestCategory();
      const product = await createTestProduct(category.id);
      const { retail } = await createTestPriceTypes();

      await createPurchase(store.id, vendor.id, product.id, 10, 5000);

      const sale = await createSale(
        store.id,
        cashbox.id,
        retail.id,
        product.id,
        1,
        7000,
        client.id,
      );

      expect(sale.priceTypeId).toBe(retail.id);
      expect(sale.clientId).toBe(client.id);
    });

    // Тест 13: Проверяет продажу по оптовой цене
    // Ожидается: правильный тип цены и расчет суммы для оптовой продажи
    it('should use correct price for wholesale sale', async () => {
      const store = await createTestStore();
      const cashbox = await createTestCashbox(store.id);
      const vendor = await createTestVendor();
      const client = await createTestClient();
      const category = await createTestCategory();
      const product = await createTestProduct(category.id);
      const { wholesale } = await createTestPriceTypes();

      await createPurchase(store.id, vendor.id, product.id, 10, 5000);

      const sale = await createSale(
        store.id,
        cashbox.id,
        wholesale.id,
        product.id,
        5,
        6000,
        client.id,
      );

      expect(sale.priceTypeId).toBe(wholesale.id);
      expect(sale.totalAmount.toString()).toBe('30000');
    });

    // Тест 14: Проверяет продажу без указания клиента (анонимная продажа)
    // Ожидается: clientId должен быть null
    it('should handle sale without client', async () => {
      const store = await createTestStore();
      const cashbox = await createTestCashbox(store.id);
      const vendor = await createTestVendor();
      const category = await createTestCategory();
      const product = await createTestProduct(category.id);
      const { retail } = await createTestPriceTypes();

      await createPurchase(store.id, vendor.id, product.id, 10, 5000);

      const sale = await createSale(
        store.id,
        cashbox.id,
        retail.id,
        product.id,
        1,
        7000,
      );

      expect(sale.clientId).toBeNull();
    });
  });

  describe('Document Status Handling', () => {
    // Тест 15: Проверяет, что DRAFT документы НЕ обновляют остатки
    // Важно: только COMPLETED документы влияют на stock
    it('should NOT update stock for DRAFT purchase', async () => {
      const store = await createTestStore();
      const vendor = await createTestVendor();
      const category = await createTestCategory();
      const product = await createTestProduct(category.id);

      // Create DRAFT purchase
      const draftPurchase = await documentPurchaseService.create({
        storeId: store.id,
        vendorId: vendor.id,
        date: new Date().toISOString(),
        status: 'DRAFT', // Not completed yet
        items: [
          {
            productId: product.id,
            quantity: 50,
            price: 1000,
          },
        ],
      });
      createdIds.purchases.push(draftPurchase.id);

      // Stock should NOT be created for DRAFT
      const stock = await getStock(product.id, store.id);
      expect(stock).toBeNull();
      expect(draftPurchase.status).toBe('DRAFT');
    });

    // Тест 16: Проверяет работу с DRAFT продажей
    // Сценарий: создание черновика продажи, который не влияет на остатки
    it('should NOT update stock for DRAFT sale', async () => {
      const store = await createTestStore();
      const cashbox = await createTestCashbox(store.id);
      const vendor = await createTestVendor();
      const category = await createTestCategory();
      const product = await createTestProduct(category.id);
      const { retail } = await createTestPriceTypes();

      // Create stock first with COMPLETED purchase
      await createPurchase(store.id, vendor.id, product.id, 50, 1200);
      await expectStock(product.id, store.id, '50', '1200');

      // Create DRAFT sale
      const draftSale = await documentSaleService.create({
        storeId: store.id,
        cashboxId: cashbox.id,
        priceTypeId: retail.id,
        date: new Date().toISOString(),
        status: 'DRAFT',
        items: [
          {
            productId: product.id,
            quantity: 20,
            price: 1800,
          },
        ],
      });
      createdIds.sales.push(draftSale.id);

      // Stock should NOT change for DRAFT
      await expectStock(product.id, store.id, '50', '1200');
      expect(draftSale.status).toBe('DRAFT');
    });

    // Тест 17: Проверяет реальный сценарий: закупка в процессе (DRAFT), остатков нет
    // Сценарий: товар еще не поступил (DRAFT закупка), остатков нет для продажи
    it('should have no stock when purchase is DRAFT', async () => {
      const store = await createTestStore();
      const vendor = await createTestVendor();
      const category = await createTestCategory();
      const product = await createTestProduct(category.id);

      // Create DRAFT purchase (товар в пути, еще не поступил)
      const draftPurchase = await documentPurchaseService.create({
        storeId: store.id,
        vendorId: vendor.id,
        date: new Date().toISOString(),
        status: 'DRAFT', // Еще не проведен
        items: [
          {
            productId: product.id,
            quantity: 100,
            price: 1000,
          },
        ],
      });
      createdIds.purchases.push(draftPurchase.id);

      // No stock available yet
      const stock = await getStock(product.id, store.id);
      expect(stock).toBeNull();
      expect(draftPurchase.status).toBe('DRAFT');
      expect(draftPurchase.totalAmount.toString()).toBe('100000');
    });

    // Тест 18: Проверяет, что COMPLETED документы обновляют остатки
    it('should update stock for COMPLETED documents', async () => {
      const store = await createTestStore();
      const vendor = await createTestVendor();
      const category = await createTestCategory();
      const product = await createTestProduct(category.id);

      // Create COMPLETED purchase
      const completedPurchase = await documentPurchaseService.create({
        storeId: store.id,
        vendorId: vendor.id,
        date: new Date().toISOString(),
        status: 'COMPLETED',
        items: [
          {
            productId: product.id,
            quantity: 75,
            price: 2000,
          },
        ],
      });
      createdIds.purchases.push(completedPurchase.id);

      // Stock should be created and updated
      await expectStock(product.id, store.id, '75', '2000');
      expect(completedPurchase.status).toBe('COMPLETED');
    });

    // Тест 19: Проверяет разницу между DRAFT и COMPLETED в одном тесте
    it('should show difference between DRAFT and COMPLETED', async () => {
      const store = await createTestStore();
      const vendor = await createTestVendor();
      const category = await createTestCategory();
      const product1 = await createTestProduct(category.id);
      const product2 = await createTestProduct(category.id);

      // DRAFT purchase - no stock
      const draftPurchase = await documentPurchaseService.create({
        storeId: store.id,
        vendorId: vendor.id,
        date: new Date().toISOString(),
        status: 'DRAFT',
        items: [{ productId: product1.id, quantity: 50, price: 1000 }],
      });
      createdIds.purchases.push(draftPurchase.id);

      // COMPLETED purchase - creates stock
      const completedPurchase = await documentPurchaseService.create({
        storeId: store.id,
        vendorId: vendor.id,
        date: new Date().toISOString(),
        status: 'COMPLETED',
        items: [{ productId: product2.id, quantity: 50, price: 1000 }],
      });
      createdIds.purchases.push(completedPurchase.id);

      // Verify: product1 has no stock, product2 has stock
      const stock1 = await getStock(product1.id, store.id);
      const stock2 = await getStock(product2.id, store.id);

      expect(stock1).toBeNull(); // DRAFT - no stock
      expect(stock2).toBeDefined(); // COMPLETED - has stock
      expect(stock2!.quantity.toString()).toBe('50');
    });
  });

  describe('Comprehensive Scenario', () => {
    // Тест 17: Комплексный тест полного жизненного цикла товара
    // Проверяет: закупка -> продажи -> новая закупка с пересчетом WAP
    it('should handle complete product lifecycle', async () => {
      const store = await createTestStore();
      const cashbox = await createTestCashbox(store.id);
      const vendor = await createTestVendor();
      const client = await createTestClient();
      const category = await createTestCategory();
      const product = await createTestProduct(category.id);
      const { retail, wholesale } = await createTestPriceTypes();

      // 1. Initial purchase
      await createPurchase(store.id, vendor.id, product.id, 100, 1000);
      await expectStock(product.id, store.id, '100', '1000');

      // 2. Wholesale sale
      await createSale(
        store.id,
        cashbox.id,
        wholesale.id,
        product.id,
        40,
        1500,
        client.id,
      );
      await expectStock(product.id, store.id, '60', '1000');

      // 3. First retail sale
      await createSale(store.id, cashbox.id, retail.id, product.id, 10, 2000);
      await expectStock(product.id, store.id, '50', '1000');

      // 4. Second retail sale
      await createSale(store.id, cashbox.id, retail.id, product.id, 10, 2000);
      await expectStock(product.id, store.id, '40', '1000');

      // 5. Restock with higher price
      await createPurchase(store.id, vendor.id, product.id, 200, 1500);
      // WAP = (40 * 1000 + 200 * 1500) / 240 = 340,000 / 240 = 1416.67
      await expectStock(product.id, store.id, '240', '1416.67');

      // 6. Final sale
      await createSale(store.id, cashbox.id, retail.id, product.id, 40, 2500);
      await expectStock(product.id, store.id, '200', '1416.67');
    });
  });

  describe('Document Return Flow', () => {
    // Тест 19: Проверяет возврат товара от клиента
    // Сценарий: клиент купил товар, но вернул его обратно
    it('should handle customer return and increase stock', async () => {
      const store = await createTestStore();
      const cashbox = await createTestCashbox(store.id);
      const vendor = await createTestVendor();
      const client = await createTestClient();
      const category = await createTestCategory();
      const product = await createTestProduct(category.id);
      const { retail } = await createTestPriceTypes();

      // 1. Purchase stock
      await createPurchase(store.id, vendor.id, product.id, 50, 1000);
      await expectStock(product.id, store.id, '50', '1000');

      // 2. Sell to client
      await createSale(
        store.id,
        cashbox.id,
        retail.id,
        product.id,
        10,
        1500,
        client.id,
      );
      await expectStock(product.id, store.id, '40', '1000');

      // 3. Client returns 3 items
      const returnDoc = await documentReturnService.create({
        storeId: store.id,
        clientId: client.id,
        date: new Date().toISOString(),
        status: 'COMPLETED',
        items: [
          {
            productId: product.id,
            quantity: 3,
            price: 1500, // Return at sale price
          },
        ],
      });
      createdIds.returns.push(returnDoc.id);

      // Stock should increase back
      await expectStock(product.id, store.id, '43', '1000'); // 40 + 3
      expect(returnDoc.totalAmount.toString()).toBe('4500');
    });

    // Тест 20: Проверяет возврат без клиента (анонимный возврат)
    it('should handle anonymous return', async () => {
      const store = await createTestStore();
      const vendor = await createTestVendor();
      const category = await createTestCategory();
      const product = await createTestProduct(category.id);

      await createPurchase(store.id, vendor.id, product.id, 20, 2000);

      const returnDoc = await documentReturnService.create({
        storeId: store.id,
        date: new Date().toISOString(),
        status: 'COMPLETED',
        items: [
          {
            productId: product.id,
            quantity: 5,
            price: 3000,
          },
        ],
      });
      createdIds.returns.push(returnDoc.id);

      await expectStock(product.id, store.id, '25', '2000'); // 20 + 5
      expect(returnDoc.clientId).toBeNull();
    });
  });

  describe('Document Adjustment Flow', () => {
    // Тест 21: Проверяет корректировку остатков (инвентаризация)
    // Сценарий: после инвентаризации обнаружена недостача
    it('should handle inventory adjustment - shortage', async () => {
      const store = await createTestStore();
      const vendor = await createTestVendor();
      const category = await createTestCategory();
      const product = await createTestProduct(category.id);

      // Initial stock: 100 items
      await createPurchase(store.id, vendor.id, product.id, 100, 1500);
      await expectStock(product.id, store.id, '100', '1500');

      // Inventory found only 95 items (shortage of 5)
      const adjustment = await documentAdjustmentService.create({
        storeId: store.id,
        date: new Date().toISOString(),
        status: 'COMPLETED',
        items: [
          {
            productId: product.id,
            quantity: -5, // Negative = decrease
            quantityBefore: 100,
            quantityAfter: 95,
          },
        ],
      });
      createdIds.adjustments.push(adjustment.id);

      await expectStock(product.id, store.id, '95', '1500');
    });

    // Тест 22: Проверяет корректировку остатков (излишки)
    // Сценарий: после инвентаризации обнаружены излишки
    it('should handle inventory adjustment - surplus', async () => {
      const store = await createTestStore();
      const vendor = await createTestVendor();
      const category = await createTestCategory();
      const product = await createTestProduct(category.id);

      // Initial stock: 50 items
      await createPurchase(store.id, vendor.id, product.id, 50, 2000);
      await expectStock(product.id, store.id, '50', '2000');

      // Inventory found 55 items (surplus of 5)
      const adjustment = await documentAdjustmentService.create({
        storeId: store.id,
        date: new Date().toISOString(),
        status: 'COMPLETED',
        items: [
          {
            productId: product.id,
            quantity: 5, // Positive = increase
            quantityBefore: 50,
            quantityAfter: 55,
          },
        ],
      });
      createdIds.adjustments.push(adjustment.id);

      await expectStock(product.id, store.id, '55', '2000');
    });

    // Тест 23: Проверяет списание испорченного товара
    // Сценарий: товар испортился и списывается
    it('should handle write-off of damaged goods', async () => {
      const store = await createTestStore();
      const vendor = await createTestVendor();
      const category = await createTestCategory();
      const product = await createTestProduct(category.id);

      await createPurchase(store.id, vendor.id, product.id, 30, 1000);

      // Write off 7 damaged items
      const adjustment = await documentAdjustmentService.create({
        storeId: store.id,
        date: new Date().toISOString(),
        status: 'COMPLETED',
        items: [
          {
            productId: product.id,
            quantity: -7,
            quantityBefore: 30,
            quantityAfter: 23,
          },
        ],
      });
      createdIds.adjustments.push(adjustment.id);

      await expectStock(product.id, store.id, '23', '1000');
      expect(adjustment.items[0].quantity.toString()).toBe('-7');
    });
  });

  describe('Document Transfer Flow', () => {
    // Тест 24: Проверяет перемещение товара между складами
    // Сценарий: перемещение товара из одного магазина в другой
    it('should transfer products between stores', async () => {
      const store1 = await createTestStore();
      const store2 = await createTestStore();
      const vendor = await createTestVendor();
      const category = await createTestCategory();
      const product = await createTestProduct(category.id);

      // Stock in store1: 100 items
      await createPurchase(store1.id, vendor.id, product.id, 100, 1200);
      await expectStock(product.id, store1.id, '100', '1200');

      // Transfer 30 items from store1 to store2
      const transfer = await documentTransferService.create({
        sourceStoreId: store1.id,
        destinationStoreId: store2.id,
        date: new Date().toISOString(),
        status: 'COMPLETED',
        items: [
          {
            productId: product.id,
            quantity: 30,
          },
        ],
      });
      createdIds.transfers.push(transfer.id);

      // Verify stock changes
      await expectStock(product.id, store1.id, '70', '1200'); // 100 - 30
      await expectStock(product.id, store2.id, '30', '1200'); // 0 + 30, WAP inherited
    });

    // Тест 25: Проверяет перемещение нескольких товаров
    it('should transfer multiple products between stores', async () => {
      const store1 = await createTestStore();
      const store2 = await createTestStore();
      const vendor = await createTestVendor();
      const category = await createTestCategory();
      const product1 = await createTestProduct(category.id);
      const product2 = await createTestProduct(category.id);

      // Stock products in store1
      await createPurchase(store1.id, vendor.id, product1.id, 50, 1000);
      await createPurchase(store1.id, vendor.id, product2.id, 80, 1500);

      // Transfer both products
      const transfer = await documentTransferService.create({
        sourceStoreId: store1.id,
        destinationStoreId: store2.id,
        date: new Date().toISOString(),
        status: 'COMPLETED',
        items: [
          { productId: product1.id, quantity: 20 },
          { productId: product2.id, quantity: 30 },
        ],
      });
      createdIds.transfers.push(transfer.id);

      // Verify both products transferred
      await expectStock(product1.id, store1.id, '30', '1000');
      await expectStock(product1.id, store2.id, '20', '1000');
      await expectStock(product2.id, store1.id, '50', '1500');
      await expectStock(product2.id, store2.id, '30', '1500');
      expect(transfer.items.length).toBe(2);
    });

    // Тест 26: Проверяет перемещение с последующей продажей
    // Сценарий: товар перемещен в другой магазин и там продан
    it('should handle transfer followed by sale in destination store', async () => {
      const store1 = await createTestStore();
      const store2 = await createTestStore();
      const cashbox2 = await createTestCashbox(store2.id);
      const vendor = await createTestVendor();
      const category = await createTestCategory();
      const product = await createTestProduct(category.id);
      const { retail } = await createTestPriceTypes();

      // Initial stock in store1
      await createPurchase(store1.id, vendor.id, product.id, 60, 1800);

      // Transfer to store2
      const transfer = await documentTransferService.create({
        sourceStoreId: store1.id,
        destinationStoreId: store2.id,
        date: new Date().toISOString(),
        status: 'COMPLETED',
        items: [{ productId: product.id, quantity: 25 }],
      });
      createdIds.transfers.push(transfer.id);

      await expectStock(product.id, store1.id, '35', '1800');
      await expectStock(product.id, store2.id, '25', '1800');

      // Sell from store2
      await createSale(store2.id, cashbox2.id, retail.id, product.id, 10, 2500);

      await expectStock(product.id, store1.id, '35', '1800'); // Unchanged
      await expectStock(product.id, store2.id, '15', '1800'); // 25 - 10
    });
  });

  describe('Complex Real-Life Scenarios', () => {
    // Тест 27: Полный цикл работы магазина за день
    // Закупка -> Продажа -> Возврат -> Корректировка
    it('should handle full day operations', async () => {
      const store = await createTestStore();
      const cashbox = await createTestCashbox(store.id);
      const vendor = await createTestVendor();
      const client = await createTestClient();
      const category = await createTestCategory();
      const product = await createTestProduct(category.id);
      const { retail } = await createTestPriceTypes();

      // Morning: Receive delivery
      await createPurchase(store.id, vendor.id, product.id, 200, 1000);
      await expectStock(product.id, store.id, '200', '1000');

      // Day: Multiple sales
      await createSale(
        store.id,
        cashbox.id,
        retail.id,
        product.id,
        30,
        1500,
        client.id,
      );
      await expectStock(product.id, store.id, '170', '1000');

      await createSale(store.id, cashbox.id, retail.id, product.id, 25, 1500);
      await expectStock(product.id, store.id, '145', '1000');

      // Afternoon: Customer return
      const returnDoc = await documentReturnService.create({
        storeId: store.id,
        clientId: client.id,
        date: new Date().toISOString(),
        status: 'COMPLETED',
        items: [{ productId: product.id, quantity: 5, price: 1500 }],
      });
      createdIds.returns.push(returnDoc.id);
      await expectStock(product.id, store.id, '150', '1000');

      // Evening: Inventory adjustment (found 2 damaged)
      const adjustment = await documentAdjustmentService.create({
        storeId: store.id,
        date: new Date().toISOString(),
        status: 'COMPLETED',
        items: [
          {
            productId: product.id,
            quantity: -2,
            quantityBefore: 150,
            quantityAfter: 148,
          },
        ],
      });
      createdIds.adjustments.push(adjustment.id);

      // Final stock
      await expectStock(product.id, store.id, '148', '1000');
    });

    // Тест 28: Сценарий с несколькими магазинами
    // Закупка в центральный склад -> Перемещение в филиалы -> Продажи
    it('should handle multi-store distribution', async () => {
      const warehouse = await createTestStore(); // Central warehouse
      const branch1 = await createTestStore(); // Branch 1
      const branch2 = await createTestStore(); // Branch 2
      const cashbox1 = await createTestCashbox(branch1.id);
      const cashbox2 = await createTestCashbox(branch2.id);
      const vendor = await createTestVendor();
      const category = await createTestCategory();
      const product = await createTestProduct(category.id);
      const { retail } = await createTestPriceTypes();

      // Central purchase
      await createPurchase(warehouse.id, vendor.id, product.id, 500, 800);
      await expectStock(product.id, warehouse.id, '500', '800');

      // Distribute to branch 1
      const transfer1 = await documentTransferService.create({
        sourceStoreId: warehouse.id,
        destinationStoreId: branch1.id,
        date: new Date().toISOString(),
        status: 'COMPLETED',
        items: [{ productId: product.id, quantity: 200 }],
      });
      createdIds.transfers.push(transfer1.id);

      // Distribute to branch 2
      const transfer2 = await documentTransferService.create({
        sourceStoreId: warehouse.id,
        destinationStoreId: branch2.id,
        date: new Date().toISOString(),
        status: 'COMPLETED',
        items: [{ productId: product.id, quantity: 150 }],
      });
      createdIds.transfers.push(transfer2.id);

      // Verify distribution
      await expectStock(product.id, warehouse.id, '150', '800'); // 500 - 200 - 150
      await expectStock(product.id, branch1.id, '200', '800');
      await expectStock(product.id, branch2.id, '150', '800');

      // Sales in branches
      await createSale(
        branch1.id,
        cashbox1.id,
        retail.id,
        product.id,
        50,
        1200,
      );
      await createSale(
        branch2.id,
        cashbox2.id,
        retail.id,
        product.id,
        40,
        1200,
      );

      // Final stocks
      await expectStock(product.id, warehouse.id, '150', '800');
      await expectStock(product.id, branch1.id, '150', '800'); // 200 - 50
      await expectStock(product.id, branch2.id, '110', '800'); // 150 - 40
    });
  });

  describe('Isolation Verification', () => {
    // Тест 18: Проверяет, что каждый тест полностью изолирован
    // Ожидается: тесты не влияют друг на друга
    it('should have isolated test data', async () => {
      const store1 = await createTestStore();
      const store2 = await createTestStore();

      expect(store1.id).not.toBe(store2.id);
      expect(store1.name).not.toBe(store2.name);

      // Verify stores are tracked for cleanup
      expect(createdIds.stores).toContain(store1.id);
      expect(createdIds.stores).toContain(store2.id);
    });
  });

  describe('Concurrency Tests', () => {
    // Тест 29: Проверяет конкурентные продажи - транзакции должны блокировать строки в БД
    // Ожидается: остаток не уходит в минус при одновременных операциях
    it('should handle concurrent sales correctly with transaction locks', async () => {
      const store = await createTestStore();
      const cashbox = await createTestCashbox(store.id);
      const vendor = await createTestVendor();
      const category = await createTestCategory();
      const product = await createTestProduct(category.id);
      const { retail } = await createTestPriceTypes();

      // Create stock with 10 items
      await createPurchase(store.id, vendor.id, product.id, 10, 5000);
      await expectStock(product.id, store.id, '10', '5000');

      // Attempt 5 concurrent sales of 3 items each (total 15, but only 10 available)
      const concurrentSales = await Promise.allSettled([
        createSale(store.id, cashbox.id, retail.id, product.id, 3, 7000),
        createSale(store.id, cashbox.id, retail.id, product.id, 3, 7000),
        createSale(store.id, cashbox.id, retail.id, product.id, 3, 7000),
        createSale(store.id, cashbox.id, retail.id, product.id, 3, 7000),
        createSale(store.id, cashbox.id, retail.id, product.id, 3, 7000),
      ]);

      // Count successful sales
      const successfulSales = concurrentSales.filter(
        (result) => result.status === 'fulfilled',
      );
      const failedSales = concurrentSales.filter(
        (result) => result.status === 'rejected',
      );

      // Verify final stock - should not be negative
      const finalStock = await getStock(product.id, store.id);
      expect(finalStock).toBeDefined();
      expect(
        parseFloat(finalStock!.quantity.toString()),
      ).toBeGreaterThanOrEqual(0);

      // Verify that total sold quantity doesn't exceed available stock
      // Some sales should fail due to insufficient stock
      const totalSold = successfulSales.length * 3;
      const expectedRemaining = 10 - totalSold;
      expect(parseFloat(finalStock!.quantity.toString())).toBe(
        expectedRemaining,
      );

      // Verify that some sales failed (not all 5 can succeed with only 10 items)
      // With 10 items and 3 per sale, maximum 3 sales can succeed (9 items), leaving 1
      // Or 3 sales of 3 items each = 9 items, with 1 remaining
      expect(successfulSales.length).toBeGreaterThan(0);
      expect(successfulSales.length).toBeLessThanOrEqual(3);
      expect(failedSales.length).toBeGreaterThan(0);
    });
  });

  describe('Negative Scenarios', () => {
    // Тест 30: Проверяет попытку продажи товара с нулевым остатком
    // Ожидается: выбрасывается BadRequestException, остаток остается нулевым
    it('should reject sale attempt with zero stock', async () => {
      const store = await createTestStore();
      const cashbox = await createTestCashbox(store.id);
      const category = await createTestCategory();
      const product = await createTestProduct(category.id);
      const { retail } = await createTestPriceTypes();

      // Verify no stock exists (product created but never purchased)
      const stockBefore = await getStock(product.id, store.id);
      expect(stockBefore).toBeNull();

      // Attempt to create sale with zero stock - should throw error
      await expect(
        createSale(store.id, cashbox.id, retail.id, product.id, 5, 7000),
      ).rejects.toThrow(BadRequestException);

      // Verify stock remains null after failed sale
      const stockAfter = await getStock(product.id, store.id);
      expect(stockAfter).toBeNull();
    });
  });
});
