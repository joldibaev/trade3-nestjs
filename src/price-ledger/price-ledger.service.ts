import { Injectable } from '@nestjs/common';

import { PriceLedger, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PriceLedgerService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    include?: Record<string, boolean>,
    filters?: {
      productId?: string;
      priceTypeId?: string;
      startDate?: Date;
      endDate?: Date;
    },
  ): Promise<PriceLedger[]> {
    const where: Prisma.PriceLedgerWhereInput = {};

    if (filters?.productId) where.productId = filters.productId;
    if (filters?.priceTypeId) where.priceTypeId = filters.priceTypeId;
    if (filters?.startDate || filters?.endDate) {
      where.date = {};
      if (filters.startDate) where.date.gte = filters.startDate;
      if (filters.endDate) where.date.lte = filters.endDate;
    }

    return this.prisma.priceLedger.findMany({
      where,
      include: include || { product: true, priceType: true },
      orderBy: { date: 'desc' },
    });
  }
}
