import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CodeGeneratorService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generates the next code for a given sequence and prefix.
   * If the sequence doesn't exist, it will be created with the given start value.
   */
  async getNextCode(sequenceName: string, prefix: string, startFrom: number): Promise<string> {
    const seqName = `seq_${sequenceName.toLowerCase()}`;

    // Ensure sequence exists
    await this.prisma.$executeRawUnsafe(`
      CREATE SEQUENCE IF NOT EXISTS "${seqName}" START WITH ${startFrom};
    `);

    // Get next value
    const result = await this.prisma.$queryRawUnsafe<{ val: string }[]>(`
      SELECT nextval('"${seqName}"')::text as val;
    `);

    const nextVal = result[0].val;
    return `${prefix}-${nextVal}`;
  }

  async getNextProductCode(): Promise<string> {
    return this.getNextCode('product', 'P', 10000);
  }

  async getNextSaleCode(): Promise<string> {
    return this.getNextCode('sale', 'S', 1);
  }

  async getNextPurchaseCode(): Promise<string> {
    return this.getNextCode('purchase', 'P', 1);
  }

  async getNextReturnCode(): Promise<string> {
    return this.getNextCode('return', 'R', 1);
  }

  async getNextAdjustmentCode(): Promise<string> {
    return this.getNextCode('adjustment', 'A', 1);
  }

  async getNextTransferCode(): Promise<string> {
    return this.getNextCode('transfer', 'T', 1);
  }

  async getNextPriceChangeCode(): Promise<string> {
    return this.getNextCode('price_change', 'PC', 1);
  }
}
