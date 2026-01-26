import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../../../src/core/prisma/prisma.service';

export class TestHelper {
  constructor(
    private readonly app: INestApplication,
    private readonly prismaService: PrismaService,
  ) {}

  async getLatestStockLedger(productId: string) {
    return this.prismaService.stockLedger.findFirst({
      where: { productId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getLatestDocumentLedger(documentId: string) {
    return this.prismaService.documentLedger.findFirst({
      where: {
        OR: [
          { documentPurchaseId: documentId },
          { documentSaleId: documentId },
          { documentReturnId: documentId },
          { documentAdjustmentId: documentId },
          { documentTransferId: documentId },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ... (previous code)

  async createPurchase(
    storeId: string,
    vendorId: string,
    productId: string,
    quantity: number,
    price: number,
    status: 'DRAFT' | 'COMPLETED' = 'COMPLETED',
    newPrices?: any[],
    expectedStatus = 201,
    customDate?: Date,
  ) {
    const date = customDate || new Date();
    if (!customDate) {
      date.setHours(0, 0, 0, 0); // Always in the past
    }

    // 1. Create Header (POST)
    const createPayload: any = {
      storeId,
      vendorId,
      date: date.toISOString(),
    };

    let res = await request(this.app.getHttpServer())
      .post('/document-purchases')
      .send(createPayload)
      .expect(expectedStatus);

    if (expectedStatus !== 201 && expectedStatus !== 200) {
      return res.body;
    }

    const purchaseId = res.body.id;
    this.createdIds.purchases.push(purchaseId);

    // 2. Add Item (POST /items)
    const itemPayload = {
      productId,
      quantity,
      price,
      newPrices: newPrices || [],
    };

    await request(this.app.getHttpServer())
      .post(`/document-purchases/${purchaseId}/items`)
      .send({ items: [itemPayload] })
      .expect(201);

    // 3. Update Status if needed
    if (status === 'COMPLETED') {
      await request(this.app.getHttpServer())
        .patch(`/document-purchases/${purchaseId}/status`)
        .send({ status: 'COMPLETED' })
        .expect(200);
    }

    // 4. Fetch and return the final document
    const finalRes = await request(this.app.getHttpServer())
      .get(`/document-purchases/${purchaseId}`)
      .expect(200);

    return finalRes.body;
  }

  async updatePurchase(id: string, updateDto: any, expectedStatus = 200) {
    // Extract items from the DTO
    const { items, ...headerDto } = updateDto;

    // 1. Update header fields
    const res = await request(this.app.getHttpServer())
      .patch(`/document-purchases/${id}`)
      .send(headerDto)
      .expect(expectedStatus);

    // 2. If items are provided, update them individually
    if (items && items.length > 0 && expectedStatus === 200) {
      // Get current document to find existing items
      const doc = await this.prismaService.documentPurchase.findUnique({
        where: { id },
        include: { items: true },
      });

      for (const itemDto of items) {
        // Find existing item by productId
        const existingItem = doc?.items.find((i) => i.productId === itemDto.productId);

        if (existingItem) {
          // Update existing item
          await request(this.app.getHttpServer())
            .patch(`/document-purchases/${id}/items/${itemDto.productId}`)
            .send(itemDto)
            .expect(200);
        } else {
          // Add new items
          await request(this.app.getHttpServer())
            .post(`/document-purchases/${id}/items`)
            .send({ items: [itemDto] })
            .expect(201);
        }
      }

      // Fetch the updated document to return
      const updatedRes = await request(this.app.getHttpServer())
        .get(`/document-purchases/${id}`)
        .expect(200);
      return updatedRes.body;
    }

    return res.body;
  }

  public createdIds = {
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
    priceChanges: [] as string[],
    stocks: [] as string[],
  };

  uniqueName(prefix: string) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  async cleanup() {
    // 0. Cleanup DocumentLedger, Reprocessing Items, and Price Ledger
    await this.prismaService.documentLedger.deleteMany({});
    await this.prismaService.inventoryReprocessingItem.deleteMany({});
    await this.prismaService.priceLedger.deleteMany({});

    // 1. Delete StockLedger and InventoryReprocessing first
    await this.prismaService.stockLedger.deleteMany({
      where: {
        OR: [
          { productId: { in: this.createdIds.products } },
          { documentSaleId: { in: this.createdIds.sales } },
          { documentPurchaseId: { in: this.createdIds.purchases } },
          { documentReturnId: { in: this.createdIds.returns } },
          { documentAdjustmentId: { in: this.createdIds.adjustments } },
          { documentTransferId: { in: this.createdIds.transfers } },
        ],
      },
    });

    await this.prismaService.inventoryReprocessing.deleteMany({
      where: {
        OR: [
          { documentSaleId: { in: this.createdIds.sales } },
          { documentPurchaseId: { in: this.createdIds.purchases } },
          { documentReturnId: { in: this.createdIds.returns } },
          { documentAdjustmentId: { in: this.createdIds.adjustments } },
          { documentTransferId: { in: this.createdIds.transfers } },
        ],
      },
    });

    // 2. Cleanup Documents and their Items

    // 2.1 Collect implicitly created PriceChanges from Purchases
    if (this.createdIds.purchases.length > 0) {
      const purchases = await this.prismaService.documentPurchase.findMany({
        where: { id: { in: this.createdIds.purchases } },
        select: { generatedPriceChange: { select: { id: true } } },
      });
      purchases.forEach((p) => {
        if (p.generatedPriceChange) {
          this.createdIds.priceChanges.push(p.generatedPriceChange.id);
        }
      });
    }

    if (this.createdIds.products.length > 0) {
      await this.prismaService.documentSaleItem.deleteMany({
        where: { productId: { in: this.createdIds.products } },
      });
      await this.prismaService.documentPurchaseItem.deleteMany({
        where: { productId: { in: this.createdIds.products } },
      });
      await this.prismaService.documentReturnItem.deleteMany({
        where: { productId: { in: this.createdIds.products } },
      });
      await this.prismaService.documentAdjustmentItem.deleteMany({
        where: { productId: { in: this.createdIds.products } },
      });
      await this.prismaService.documentTransferItem.deleteMany({
        where: { productId: { in: this.createdIds.products } },
      });
      // Also delete items by productId
      await this.prismaService.documentPriceChangeItem.deleteMany({
        where: { productId: { in: this.createdIds.products } },
      });
    }

    // Delete PriceChange items by Document ID (in case product wasn't tracked or deleted)
    if (this.createdIds.priceChanges.length > 0) {
      await this.prismaService.documentPriceChangeItem.deleteMany({
        where: { documentId: { in: this.createdIds.priceChanges } },
      });

      await this.prismaService.documentPriceChange.deleteMany({
        where: { id: { in: this.createdIds.priceChanges } },
      });
    }

    if (this.createdIds.stores.length > 0) {
      await this.prismaService.documentSale.deleteMany({
        where: { storeId: { in: this.createdIds.stores } },
      });
      await this.prismaService.documentPurchase.deleteMany({
        where: { storeId: { in: this.createdIds.stores } },
      });
      await this.prismaService.documentReturn.deleteMany({
        where: { storeId: { in: this.createdIds.stores } },
      });
      await this.prismaService.documentAdjustment.deleteMany({
        where: { storeId: { in: this.createdIds.stores } },
      });
      await this.prismaService.documentTransfer.deleteMany({
        where: {
          OR: [
            { sourceStoreId: { in: this.createdIds.stores } },
            { destinationStoreId: { in: this.createdIds.stores } },
          ],
        },
      });
    }

    // 3. Cleanup Master Data
    if (this.createdIds.products.length > 0) {
      await this.prismaService.stock.deleteMany({
        where: { productId: { in: this.createdIds.products } },
      });
      await this.prismaService.price.deleteMany({
        where: { productId: { in: this.createdIds.products } },
      });
      await this.prismaService.barcode.deleteMany({
        where: { productId: { in: this.createdIds.products } },
      });
      await this.prismaService.product.deleteMany({
        where: { id: { in: this.createdIds.products } },
      });
    }

    if (this.createdIds.categories.length > 0) {
      await this.prismaService.category.deleteMany({
        where: { id: { in: this.createdIds.categories } },
      });
    }
    if (this.createdIds.cashboxes.length > 0) {
      await this.prismaService.cashbox.deleteMany({
        where: { id: { in: this.createdIds.cashboxes } },
      });
    }
    if (this.createdIds.stores.length > 0) {
      await this.prismaService.store.deleteMany({ where: { id: { in: this.createdIds.stores } } });
    }
    if (this.createdIds.clients.length > 0) {
      await this.prismaService.client.deleteMany({
        where: { id: { in: this.createdIds.clients } },
      });
    }
    if (this.createdIds.vendors.length > 0) {
      await this.prismaService.vendor.deleteMany({
        where: { id: { in: this.createdIds.vendors } },
      });
    }
    if (this.createdIds.priceTypes.length > 0) {
      await this.prismaService.priceType.deleteMany({
        where: { id: { in: this.createdIds.priceTypes } },
      });
    }

    // Reset tracked IDs
    Object.keys(this.createdIds).forEach((key) => {
      (this.createdIds as any)[key] = [];
    });
  }

  async createStore() {
    const store = await this.prismaService.store.create({
      data: { name: this.uniqueName('Store') },
    });
    this.createdIds.stores.push(store.id);
    return store;
  }

  async createCashbox(storeId: string) {
    const cashbox = await this.prismaService.cashbox.create({
      data: {
        name: this.uniqueName('Cashbox'),
        storeId,
      },
    });
    this.createdIds.cashboxes.push(cashbox.id);
    return cashbox;
  }

  async createVendor() {
    const vendor = await this.prismaService.vendor.create({
      data: { name: this.uniqueName('Vendor') },
    });
    this.createdIds.vendors.push(vendor.id);
    return vendor;
  }

  async createClient() {
    const client = await this.prismaService.client.create({
      data: { name: this.uniqueName('Client') },
    });
    this.createdIds.clients.push(client.id);
    return client;
  }

  async createPriceTypes() {
    const retail = await this.prismaService.priceType.create({
      data: { name: this.uniqueName('Retail') },
    });
    const wholesale = await this.prismaService.priceType.create({
      data: { name: this.uniqueName('Wholesale') },
    });
    this.createdIds.priceTypes.push(retail.id, wholesale.id);
    return { retail, wholesale };
  }

  async createCategory(name?: string) {
    const category = await this.prismaService.category.create({
      data: { name: name || this.uniqueName('Category') },
    });
    this.createdIds.categories.push(category.id);
    return category;
  }

  async createProduct(categoryId: string, data?: any) {
    const product = await this.prismaService.product.create({
      data: {
        name: this.uniqueName('Product'),
        code: this.uniqueName('CODE'),
        ...data,
        categoryId,
      },
    });
    this.createdIds.products.push(product.id);
    return product;
  }

  async getStock(productId: string, storeId: string) {
    const stock = await this.prismaService.stock.findUnique({
      where: { productId_storeId: { productId, storeId } },
    });
    if (stock && !this.createdIds.stocks.includes(stock.id)) {
      this.createdIds.stocks.push(stock.id);
    }
    return stock;
  }

  async createSale(
    storeId: string,
    cashboxId: string,
    priceTypeId: string,
    productId: string,
    quantity: number,
    price: number,
    clientId?: string,
    status: 'DRAFT' | 'COMPLETED' = 'COMPLETED',
    expectedStatus = 201,
    customDate?: Date,
  ) {
    const date = customDate || new Date();
    if (!customDate) {
      date.setHours(0, 0, 0, 0); // Always in the past
    }

    const payload = {
      storeId,
      cashboxId,
      clientId,
      priceTypeId,
      date: date.toISOString(),
      status: 'DRAFT',
    };

    const res = await request(this.app.getHttpServer())
      .post('/document-sales')
      .send(payload)
      .expect(201);

    const saleId = res.body.id;
    this.createdIds.sales.push(saleId);

    // Add item - may fail if validation errors occur
    try {
      await request(this.app.getHttpServer())
        .post(`/document-sales/${saleId}/items`)
        .send({ items: [{ productId, quantity, price }] })
        .expect(201);
    } catch (error) {
      // If expectedStatus is not 201, this might be the expected failure
      if (expectedStatus !== 201) {
        // Return error response
        return (error as any).response?.body || { message: 'Item addition failed' };
      }
      throw error;
    }

    if (status === 'COMPLETED') {
      // If expectedStatus is 201 (default for creation), use 200 for status change
      const statusExpectedCode = expectedStatus === 201 ? 200 : expectedStatus;

      try {
        await request(this.app.getHttpServer())
          .patch(`/document-sales/${saleId}/status`)
          .send({ status: 'COMPLETED' })
          .expect(statusExpectedCode);
      } catch (error) {
        // If status change failed and we expected success, throw the error
        if (statusExpectedCode === 200) {
          throw error;
        }
        // Otherwise return the error response
        return (error as any).response?.body || { message: 'Status update failed' };
      }
    }

    // Fetch and return the final document
    const finalRes = await request(this.app.getHttpServer())
      .get(`/document-sales/${saleId}`)
      .expect(200);

    return finalRes.body;
  }

  async createReturn(
    storeId: string,
    clientId: string,
    productId: string,
    quantity: number,
    price: number,
    status: 'DRAFT' | 'COMPLETED' = 'COMPLETED',
    expectedStatus = 201,
  ) {
    const payload = {
      storeId,
      clientId,
      date: new Date().toISOString(),
      status: 'DRAFT',
    };

    let res = await request(this.app.getHttpServer())
      .post('/document-returns')
      .send(payload)
      .expect(expectedStatus);

    if (expectedStatus !== 201 && expectedStatus !== 200) {
      return res.body;
    }

    const docId = res.body.id;
    this.createdIds.returns.push(docId);

    // Add item
    await request(this.app.getHttpServer())
      .post(`/document-returns/${docId}/items`)
      .send({ items: [{ productId, quantity, price }] })
      .expect(201);

    if (status === 'COMPLETED') {
      res = await request(this.app.getHttpServer())
        .patch(`/document-returns/${docId}/status`)
        .send({ status: 'COMPLETED' })
        .expect(200);
    }

    return res.body;
  }

  async createAdjustment(
    storeId: string,
    productId: string,
    quantityDelta: number,
    status: 'DRAFT' | 'COMPLETED' = 'COMPLETED',
    expectedStatus = 201,
  ) {
    const payload = {
      storeId,
      date: new Date().toISOString(),
      status: 'DRAFT',
    };

    let res = await request(this.app.getHttpServer())
      .post('/document-adjustments')
      .send(payload)
      .expect(expectedStatus);

    if (expectedStatus !== 201 && expectedStatus !== 200) {
      return res.body;
    }

    const docId = res.body.id;
    this.createdIds.adjustments.push(docId);

    // Add item
    await request(this.app.getHttpServer())
      .post(`/document-adjustments/${docId}/items`)
      .send({ items: [{ productId, quantity: quantityDelta }] })
      .expect(201);

    if (status === 'COMPLETED') {
      res = await request(this.app.getHttpServer())
        .patch(`/document-adjustments/${docId}/status`)
        .send({ status: 'COMPLETED' })
        .expect(200);
    }

    return res.body;
  }

  async createTransfer(
    sourceStoreId: string,
    destinationStoreId: string,
    productId: string,
    quantity: number,
    status: 'DRAFT' | 'COMPLETED' = 'COMPLETED',
    expectedStatus = 201,
  ) {
    const payload = {
      sourceStoreId,
      destinationStoreId,
      date: new Date().toISOString(),
      status: 'DRAFT',
    };

    const res = await request(this.app.getHttpServer())
      .post('/document-transfers')
      .send(payload)
      .expect(201);

    const docId = res.body.id;
    this.createdIds.transfers.push(docId);

    // Add item
    await request(this.app.getHttpServer())
      .post(`/document-transfers/${docId}/items`)
      .send({ items: [{ productId, quantity }] })
      .expect(201);

    if (status === 'COMPLETED') {
      // If expectedStatus is 201 (default for creation), use 200 for status change
      const statusExpectedCode = expectedStatus === 201 ? 200 : expectedStatus;
      const statusRes = await request(this.app.getHttpServer())
        .patch(`/document-transfers/${docId}/status`)
        .send({ status: 'COMPLETED' })
        .expect(statusExpectedCode);

      // If status change failed, return the error response
      if (statusExpectedCode !== 200) {
        return statusRes.body;
      }
    }

    // Fetch and return the final document
    const finalRes = await request(this.app.getHttpServer())
      .get(`/document-transfers/${docId}`)
      .expect(200);

    return finalRes.body;
  }

  async completePurchase(
    id: string,
    status: 'DRAFT' | 'COMPLETED' | 'CANCELLED' = 'COMPLETED',
    expectedStatus = 200,
  ) {
    const res = await request(this.app.getHttpServer())
      .patch(`/document-purchases/${id}/status`)
      .send({ status })
      .expect(expectedStatus);
    return res.body;
  }

  async completeSale(
    id: string,
    status: 'DRAFT' | 'COMPLETED' | 'CANCELLED' = 'COMPLETED',
    expectedStatus = 200,
  ) {
    const res = await request(this.app.getHttpServer())
      .patch(`/document-sales/${id}/status`)
      .send({ status })
      .expect(expectedStatus);
    return res.body;
  }

  async completeReturn(
    id: string,
    status: 'DRAFT' | 'COMPLETED' | 'CANCELLED' = 'COMPLETED',
    expectedStatus = 200,
  ) {
    const res = await request(this.app.getHttpServer())
      .patch(`/document-returns/${id}/status`)
      .send({ status })
      .expect(expectedStatus);
    return res.body;
  }

  async completeAdjustment(
    id: string,
    status: 'DRAFT' | 'COMPLETED' | 'CANCELLED' = 'COMPLETED',
    expectedStatus = 200,
  ) {
    const res = await request(this.app.getHttpServer())
      .patch(`/document-adjustments/${id}/status`)
      .send({ status })
      .expect(expectedStatus);
    return res.body;
  }

  async completeTransfer(
    id: string,
    status: 'DRAFT' | 'COMPLETED' | 'CANCELLED' = 'COMPLETED',
    expectedStatus = 200,
  ) {
    const res = await request(this.app.getHttpServer())
      .patch(`/document-transfers/${id}/status`)
      .send({ status })
      .expect(expectedStatus);
    return res.body;
  }

  async addStock(storeId: string, productId: string, quantity: number, price: number) {
    await this.createPurchase(
      storeId,
      (await this.createVendor()).id,
      productId,
      quantity,
      price,
      'COMPLETED',
    );
  }
}
