import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateProductDto } from '../generated/dto/product/create-product.dto';
import { UpdateProductDto } from '../generated/dto/product/update-product.dto';
import { PrismaService } from '../core/prisma/prisma.service';

@Injectable()
export class ProductService {
  constructor(private readonly prisma: PrismaService) {}

  create(createProductDto: CreateProductDto) {
    return this.prisma.product.create({
      data: createProductDto,
    });
  }

  findAll(
    categoryId?: string,
    query?: string,
    isActive?: boolean,
    include?: Record<string, boolean>,
  ) {
    return this.prisma.product.findMany({
      where: {
        deletedAt: null,
        AND: [
          categoryId ? { categoryId } : {},
          isActive !== undefined ? { isActive } : {},
          query
            ? {
                OR: [
                  { name: { contains: query, mode: 'insensitive' } },
                  { article: { contains: query, mode: 'insensitive' } },
                  {
                    barcodes: {
                      some: {
                        value: { contains: query, mode: 'insensitive' },
                        deletedAt: null,
                      },
                    },
                  },
                ],
              }
            : {},
        ],
      },
      orderBy: { createdAt: 'desc' },
      include,
    });
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        category: { include: { parent: true } },
        prices: {
          include: { priceType: true },
        },
        stocks: {
          include: { store: true },
        },
        priceHistory: {
          include: { priceType: true },
        },
        barcodes: {
          where: { deletedAt: null },
        },
      },
    });
    if (!product) throw new NotFoundException('Продукт не найден');
    return product;
  }

  update(id: string, updateProductDto: UpdateProductDto) {
    return this.prisma.product.update({
      where: { id },
      data: updateProductDto,
    });
  }

  remove(id: string) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Soft Delete dependencies
      await tx.barcode.updateMany({
        where: { productId: id },
        data: { deletedAt: new Date() },
      });
      // Stock and Price are history/logs, we keep them linked to the deleted product.

      // 2. Soft Delete Product
      return tx.product.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
    });
  }
}
