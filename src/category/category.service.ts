import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateCategoryDto } from '../generated/dto/category/create-category.dto';
import { UpdateCategoryDto } from '../generated/dto/category/update-category.dto';
import { PrismaService } from '../core/prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';

@Injectable()
export class CategoryService {
  constructor(private readonly prisma: PrismaService) {}

  create(createCategoryDto: CreateCategoryDto) {
    return this.prisma.category.create({
      data: createCategoryDto,
    });
  }

  findAll(where?: Prisma.CategoryWhereInput, include?: Record<string, boolean>) {
    return this.prisma.category.findMany({
      where: {
        ...where,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      include,
    });
  }

  async findOne(id: string, include?: Record<string, boolean>) {
    const category = await this.prisma.category.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include,
    });
    if (!category) throw new NotFoundException('Категория не найдена');
    return category;
  }

  update(id: string, updateCategoryDto: UpdateCategoryDto) {
    return this.prisma.category.update({
      where: { id },
      data: updateCategoryDto,
    });
  }

  remove(id: string) {
    return this.prisma.category.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
