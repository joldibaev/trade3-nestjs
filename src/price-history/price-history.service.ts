import { Injectable } from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';

@Injectable()
export class PriceHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    include?: Record<string, boolean>,
    filters?: {
      productId?: string;
      priceTypeId?: string;
    },
  ) {
    const where: Prisma.PriceHistoryWhereInput = {};

    if (filters?.productId) {
      where.productId = filters.productId;
    }
    if (filters?.priceTypeId) {
      where.priceTypeId = filters.priceTypeId;
    }

    return this.prisma.priceHistory.findMany({
      where,
      include,
      orderBy: { createdAt: 'desc' },
    });
  }
}
