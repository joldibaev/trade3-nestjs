import { Injectable } from '@nestjs/common';

import { CategoryService } from '../category/category.service';
import { CodeGeneratorService } from '../code-generator/code-generator.service';
import { Prisma, Product } from '../generated/prisma/client';
import { CreateProductDto } from '../generated/types/backend/dto/product/create-product.dto';
import { UpdateProductDto } from '../generated/types/backend/dto/product/update-product.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProductService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly codeGenerator: CodeGeneratorService,
    private readonly categoryService: CategoryService,
  ) {}

  async create(createProductDto: CreateProductDto): Promise<Product> {
    const code = await this.codeGenerator.getNextProductCode();
    return this.prisma.product.create({
      data: {
        ...createProductDto,
        code,
      },
    });
  }

  async findAll(
    categoryId?: string,
    query?: string,
    include?: Record<string, boolean>,
  ): Promise<Product[]> {
    let categoryIds: string[] | undefined;
    if (categoryId) {
      const subCategoryIds = await this.categoryService.getSubcategoryIds(categoryId);
      categoryIds = [categoryId, ...subCategoryIds];
    }

    const where: Prisma.ProductWhereInput = {
      AND: [categoryIds ? { categoryId: { in: categoryIds } } : {}],
    };

    if (query) {
      const tokens = query
        .trim()
        .split(/\s+/)
        .filter((t) => t.length > 0);
      if (tokens.length > 0) {
        const andArray = (where.AND as Prisma.ProductWhereInput[]) || [];
        andArray.push({
          AND: tokens.map((token) => ({
            OR: [
              { name: { contains: token, mode: 'insensitive' } },
              { article: { contains: token, mode: 'insensitive' } },
              { code: { contains: token, mode: 'insensitive' } },
              {
                barcodes: {
                  some: {
                    value: { contains: token, mode: 'insensitive' },
                  },
                },
              },
            ],
          })),
        });
        where.AND = andArray;
      }
    }

    return this.prisma.product.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include,
    });
  }

  findOne(id: string): Promise<Product> {
    return this.prisma.product.findUniqueOrThrow({
      where: { id },
      include: {
        category: { include: { parent: true } },
        prices: {
          include: { priceType: true },
        },
        stocks: {
          include: { store: true },
        },
        priceLedger: {
          include: { priceType: true },
        },
        barcodes: true,
      },
    });
  }

  async update(id: string, updateProductDto: UpdateProductDto): Promise<Product> {
    return this.prisma.product.update({
      where: { id },
      data: { ...updateProductDto },
    });
  }

  remove(id: string): Promise<Product> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Delete dependencies
      await tx.stock.deleteMany({ where: { productId: id } });
      await tx.price.deleteMany({ where: { productId: id } });
      await tx.barcode.deleteMany({ where: { productId: id } });

      // 2. Delete Product
      return tx.product.delete({
        where: { id },
      });
    });
  }

  async getLastPurchasePrice(id: string): Promise<number> {
    const lastItem = await this.prisma.documentPurchaseItem.findFirst({
      where: { productId: id },
      orderBy: { purchase: { date: 'desc' } }, // Order by document date, most recent first
      select: { price: true },
    });

    return lastItem?.price ? Number(lastItem.price) : 0;
  }
}
