import { Injectable } from '@nestjs/common';
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

  findAll(categoryId?: string, include?: Record<string, boolean>) {
    return this.prisma.product.findMany({
      where: { categoryId },
      orderBy: { createdAt: 'desc' },
      include,
    });
  }

  findOne(id: string, include?: Record<string, boolean>) {
    return this.prisma.product.findUniqueOrThrow({
      where: { id },
      include,
    });
  }

  update(id: string, updateProductDto: UpdateProductDto) {
    return this.prisma.product.update({
      where: { id },
      data: updateProductDto,
    });
  }

  remove(id: string) {
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
}
