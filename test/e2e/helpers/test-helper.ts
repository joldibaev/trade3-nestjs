import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../../../src/core/prisma/prisma.service';

export class TestHelper {
  constructor(
    private readonly app: INestApplication,
    private readonly prismaService: PrismaService,
  ) { }

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
  ) {
    const date = new Date();
    date.setHours(10, 0, 0, 0);

    const payload: any = {
      storeId,
      vendorId,
      date: date.toISOString(),
      status: status,
      items: [
        {
          productId,
          quantity,
          price,
          newPrices,
        },
      ],
    };

    let res = await request(this.app.getHttpServer())
      .post('/document-purchases')
      .send(payload)
      .expect(expectedStatus);

    if (expectedStatus !== 201 && expectedStatus !== 200) {
      return res.body;
    }

    let purchaseId = res.body.id;

    // Only PATCH if we created as DRAFT but want COMPLETED (and didn't create as COMPLETED)
    // But if we passed status=COMPLETED in payload, res.body.status should be COMPLETED.
    // However, if the API *ignores* status=COMPLETED in create and forces DRAFT, we still need patch.
    // Let's assume API respects it. If not, we check res.body.status.

    if (status === 'COMPLETED' && res.body.status !== 'COMPLETED') {
      res = await request(this.app.getHttpServer())
        .patch(`/document-purchases/${purchaseId}/status`)
        .send({ status: 'COMPLETED' })
        .expect(200);
    }

    this.createdIds.purchases.push(purchaseId);
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
    stocks: [] as string[],
    users: [] as string[],
  };

  uniqueName(prefix: string) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  async cleanup() {
    // 1. Delete StockMovements first as they reference both products and all document types
    await this.prismaService.stockMovement.deleteMany({
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

    // 2. Cleanup Documents and their Items
    // Also delete items linked to our products, to catch any orphans
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
    }

    // Also delete documents linked to our stores, to catch orphans
    if (this.createdIds.stores.length > 0) {
      // Sales
      await this.prismaService.documentSaleItem.deleteMany({
        where: { sale: { storeId: { in: this.createdIds.stores } } },
      });
      await this.prismaService.documentSale.deleteMany({
        where: { storeId: { in: this.createdIds.stores } },
      });

      // Purchases (linked to store)
      await this.prismaService.documentPurchaseItem.deleteMany({
        where: { purchase: { storeId: { in: this.createdIds.stores } } },
      });
      await this.prismaService.documentPurchase.deleteMany({
        where: { storeId: { in: this.createdIds.stores } },
      });

      // Returns
      await this.prismaService.documentReturnItem.deleteMany({
        where: { return: { storeId: { in: this.createdIds.stores } } },
      });
      await this.prismaService.documentReturn.deleteMany({
        where: { storeId: { in: this.createdIds.stores } },
      });

      // Adjustments
      await this.prismaService.documentAdjustmentItem.deleteMany({
        where: { adjustment: { storeId: { in: this.createdIds.stores } } },
      });
      await this.prismaService.documentAdjustment.deleteMany({
        where: { storeId: { in: this.createdIds.stores } },
      });

      // Transfers (Source or Destination)
      await this.prismaService.documentTransferItem.deleteMany({
        where: {
          transfer: {
            OR: [
              { sourceStoreId: { in: this.createdIds.stores } },
              { destinationStoreId: { in: this.createdIds.stores } },
            ],
          },
        },
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

    if (this.createdIds.sales.length > 0) {
      // Cleanup specifically tracked sales (redundant but safe)
      await this.prismaService.documentSaleItem.deleteMany({
        where: { saleId: { in: this.createdIds.sales } },
      });
      await this.prismaService.documentSale.deleteMany({
        where: { id: { in: this.createdIds.sales } },
      });
    }
    // ... continue with other explicit deletions if needed, but store-based should cover most.

    // Explicit cleanup for other tracked documents just in case they aren't linked to tracked stores (unlikely in tests but possible)
    if (this.createdIds.returns.length > 0) {
      await this.prismaService.documentReturnItem.deleteMany({
        where: { returnId: { in: this.createdIds.returns } },
      });
      await this.prismaService.documentReturn.deleteMany({
        where: { id: { in: this.createdIds.returns } },
      });
    }

    if (this.createdIds.adjustments.length > 0) {
      await this.prismaService.documentAdjustmentItem.deleteMany({
        where: { adjustmentId: { in: this.createdIds.adjustments } },
      });
      await this.prismaService.documentAdjustment.deleteMany({
        where: { id: { in: this.createdIds.adjustments } },
      });
    }

    if (this.createdIds.transfers.length > 0) {
      await this.prismaService.documentTransferItem.deleteMany({
        where: { transferId: { in: this.createdIds.transfers } },
      });
      await this.prismaService.documentTransfer.deleteMany({
        where: { id: { in: this.createdIds.transfers } },
      });
    }

    if (this.createdIds.purchases.length > 0) {
      await this.prismaService.documentPurchaseItem.deleteMany({
        where: { purchaseId: { in: this.createdIds.purchases } },
      });
      await this.prismaService.documentPurchase.deleteMany({
        where: { id: { in: this.createdIds.purchases } },
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
      await this.prismaService.store.deleteMany({
        where: { id: { in: this.createdIds.stores } },
      });
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

    if (this.createdIds.users.length > 0) {
      await this.prismaService.user.deleteMany({
        where: { id: { in: this.createdIds.users } },
      });
    }
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
  ) {
    const date = new Date();
    date.setHours(14, 0, 0, 0);

    const payload = {
      storeId,
      cashboxId,
      clientId,
      priceTypeId,
      date: date.toISOString(),
      status: status,
      items: [
        {
          productId,
          quantity,
        },
      ],
    };

    let res = await request(this.app.getHttpServer())
      .post('/document-sales')
      .send(payload)
      .expect(expectedStatus);

    if (expectedStatus !== 201 && expectedStatus !== 200) {
      return res.body;
    }

    const saleId = res.body.id;

    if (status === 'COMPLETED' && res.body.status !== 'COMPLETED') {
      res = await request(this.app.getHttpServer())
        .patch(`/document-sales/${saleId}/status`)
        .send({ status: 'COMPLETED' })
        .expect(200);
    }

    this.createdIds.sales.push(saleId);
    return res.body;
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
      status: status,
      items: [{ productId, quantity, price }],
    };

    let res = await request(this.app.getHttpServer())
      .post('/document-returns')
      .send(payload)
      .expect(expectedStatus);

    if (expectedStatus !== 201 && expectedStatus !== 200) {
      return res.body;
    }

    const docId = res.body.id;

    if (status === 'COMPLETED' && res.body.status !== 'COMPLETED') {
      res = await request(this.app.getHttpServer())
        .patch(`/document-returns/${docId}/status`)
        .send({ status: 'COMPLETED' })
        .expect(200);
    }

    this.createdIds.returns.push(docId);
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
      status: status,
      items: [{ productId, quantity: quantityDelta }],
    };

    let res = await request(this.app.getHttpServer())
      .post('/document-adjustments')
      .send(payload)
      .expect(expectedStatus);

    if (expectedStatus !== 201 && expectedStatus !== 200) {
      return res.body;
    }

    const docId = res.body.id;

    if (status === 'COMPLETED' && res.body.status !== 'COMPLETED') {
      res = await request(this.app.getHttpServer())
        .patch(`/document-adjustments/${docId}/status`)
        .send({ status: 'COMPLETED' })
        .expect(200);
    }

    this.createdIds.adjustments.push(docId);
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
      status: status,
      items: [{ productId, quantity }],
    };

    let res = await request(this.app.getHttpServer())
      .post('/document-transfers')
      .send(payload)
      .expect(expectedStatus);

    if (expectedStatus !== 201 && expectedStatus !== 200) {
      return res.body;
    }

    const docId = res.body.id;

    if (status === 'COMPLETED' && res.body.status !== 'COMPLETED') {
      res = await request(this.app.getHttpServer())
        .patch(`/document-transfers/${docId}/status`)
        .send({ status: 'COMPLETED' })
        .expect(200);
    }

    this.createdIds.transfers.push(docId);
    return res.body;
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
