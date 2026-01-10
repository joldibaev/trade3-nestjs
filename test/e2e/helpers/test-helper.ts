import { PrismaService } from '../../../src/core/prisma/prisma.service';
import { StoreService } from '../../../src/store/store.service';
import { CashboxService } from '../../../src/cashbox/cashbox.service';
import { VendorService } from '../../../src/vendor/vendor.service';
import { ClientService } from '../../../src/client/client.service';
import { PriceTypeService } from '../../../src/pricetype/pricetype.service';
import { ProductService } from '../../../src/product/product.service';
import { CategoryService } from '../../../src/category/category.service';
import { DocumentPurchaseService } from '../../../src/document-purchase/document-purchase.service';
import { DocumentSaleService } from '../../../src/document-sale/document-sale.service';
import { DocumentReturnService } from '../../../src/document-return/document-return.service';
import { DocumentAdjustmentService } from '../../../src/document-adjustment/document-adjustment.service';
import { DocumentTransferService } from '../../../src/document-transfer/document-transfer.service';

export class TestHelper {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly storeService: StoreService,
    private readonly cashboxService: CashboxService,
    private readonly vendorService: VendorService,
    private readonly clientService: ClientService,
    private readonly priceTypeService: PriceTypeService,
    private readonly productService: ProductService,
    private readonly categoryService: CategoryService,
    private readonly documentPurchaseService: DocumentPurchaseService,
    private readonly documentSaleService: DocumentSaleService,
    private readonly documentReturnService: DocumentReturnService,
    private readonly documentAdjustmentService: DocumentAdjustmentService,
    private readonly documentTransferService: DocumentTransferService,
  ) { }

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
    if (this.createdIds.sales.length > 0) {
      await this.prismaService.documentSaleItem.deleteMany({
        where: { saleId: { in: this.createdIds.sales } },
      });
      await this.prismaService.documentSale.deleteMany({
        where: { id: { in: this.createdIds.sales } },
      });
    }

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
  }

  async createStore() {
    const store = await this.storeService.create({
      name: this.uniqueName('Store'),
    });
    this.createdIds.stores.push(store.id);
    return store;
  }

  async createCashbox(storeId: string) {
    const cashbox = await this.cashboxService.create({
      name: this.uniqueName('Cashbox'),
      storeId,
    });
    this.createdIds.cashboxes.push(cashbox.id);
    return cashbox;
  }

  async createVendor() {
    const vendor = await this.vendorService.create({
      name: this.uniqueName('Vendor'),
    });
    this.createdIds.vendors.push(vendor.id);
    return vendor;
  }

  async createClient() {
    const client = await this.clientService.create({
      name: this.uniqueName('Client'),
    });
    this.createdIds.clients.push(client.id);
    return client;
  }

  async createPriceTypes() {
    const retail = await this.priceTypeService.create({
      name: this.uniqueName('Retail'),
    });
    const wholesale = await this.priceTypeService.create({
      name: this.uniqueName('Wholesale'),
    });
    this.createdIds.priceTypes.push(retail.id, wholesale.id);
    return { retail, wholesale };
  }

  async createCategory() {
    const category = await this.categoryService.create({
      name: this.uniqueName('Category'),
    });
    this.createdIds.categories.push(category.id);
    return category;
  }

  async createProduct(categoryId: string) {
    const product = await this.productService.create({
      name: this.uniqueName('Product'),
      categoryId,
    });
    this.createdIds.products.push(product.id);
    return product;
  }

  async getStock(productId: string, storeId: string) {
    const stock = await this.prismaService.stock.findUnique({
      where: { productId_storeId: { productId, storeId } },
    });
    if (stock && !this.createdIds.stocks.includes(stock.id)) {
      // We generally don't delete stocks individually, but okay to track
      this.createdIds.stocks.push(stock.id);
    }
    return stock;
  }

  async createPurchase(
    storeId: string,
    vendorId: string,
    productId: string,
    quantity: number,
    price: number,
    status: 'DRAFT' | 'COMPLETED' = 'COMPLETED',
    newPrices?: any[],
  ) {
    const date = new Date();
    date.setHours(10, 0, 0, 0);

    const purchase = await this.documentPurchaseService.create({
      storeId,
      vendorId,
      date: date.toISOString(),
      status,
      items: [{ productId, quantity, price, newPrices }],
    });
    this.createdIds.purchases.push(purchase.id);
    return purchase;
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
  ) {
    const date = new Date();
    date.setHours(14, 0, 0, 0);

    const sale = await this.documentSaleService.create({
      storeId,
      cashboxId,
      clientId,
      priceTypeId,
      date: date.toISOString(),
      status,
      items: [{ productId, quantity, price }],
    });
    this.createdIds.sales.push(sale.id);
    return sale;
  }

  async createReturn(
    storeId: string,
    clientId: string,
    productId: string,
    quantity: number,
    price: number,
    status: 'DRAFT' | 'COMPLETED' = 'COMPLETED',
  ) {
    const doc = await this.documentReturnService.create({
      storeId,
      clientId,
      date: new Date().toISOString(),
      status,
      items: [{ productId, quantity, price }],
    });
    this.createdIds.returns.push(doc.id);
    return doc;
  }

  async createAdjustment(
    storeId: string,
    productId: string,
    quantityDelta: number,
    status: 'DRAFT' | 'COMPLETED' = 'COMPLETED',
  ) {
    const doc = await this.documentAdjustmentService.create({
      storeId,
      date: new Date().toISOString(),
      status,
      items: [{ productId, quantity: quantityDelta }],
    });
    this.createdIds.adjustments.push(doc.id);
    return doc;
  }

  async createTransfer(
    sourceStoreId: string,
    destinationStoreId: string,
    productId: string,
    quantity: number,
    status: 'DRAFT' | 'COMPLETED' = 'COMPLETED',
  ) {
    const doc = await this.documentTransferService.create({
      sourceStoreId,
      destinationStoreId,
      date: new Date().toISOString(),
      status,
      items: [{ productId, quantity }],
    });
    this.createdIds.transfers.push(doc.id);
    return doc;
  }

  async completePurchase(id: string) {
    return this.documentPurchaseService.updateStatus(id, 'COMPLETED');
  }

  async completeSale(id: string) {
    return this.documentSaleService.updateStatus(id, 'COMPLETED');
  }

  async completeReturn(id: string) {
    return this.documentReturnService.updateStatus(id, 'COMPLETED');
  }

  async completeAdjustment(id: string) {
    return this.documentAdjustmentService.updateStatus(id, 'COMPLETED');
  }

  async completeTransfer(id: string) {
    return this.documentTransferService.updateStatus(id, 'COMPLETED');
  }

  async addStock(storeId: string, productId: string, quantity: number, price: number) {
    await this.createPurchase(storeId, (await this.createVendor()).id, productId, quantity, price, 'COMPLETED');
  }
}
