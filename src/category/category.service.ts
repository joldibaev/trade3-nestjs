import { Injectable } from '@nestjs/common';

import { Prisma } from '../generated/prisma/client';
import { Category } from '../generated/prisma/client';
import { CreateCategoryDto } from '../generated/types/backend/dto/category/create-category.dto';
import { UpdateCategoryDto } from '../generated/types/backend/dto/category/update-category.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CategoryService {
  constructor(private readonly prisma: PrismaService) {}

  create(createCategoryDto: CreateCategoryDto): Promise<Category> {
    return this.prisma.category.create({
      data: createCategoryDto,
    });
  }

  findAll(
    where?: Prisma.CategoryWhereInput,
    include?: Record<string, boolean>,
  ): Promise<Category[]> {
    return this.prisma.category.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include,
    });
  }

  findOne(id: string, include?: Record<string, boolean>): Promise<Category> {
    return this.prisma.category.findUniqueOrThrow({
      where: { id },
      include,
    });
  }

  async update(id: string, updateCategoryDto: UpdateCategoryDto): Promise<Category> {
    return this.prisma.category.update({
      where: { id },
      data: { ...updateCategoryDto },
    });
  }

  remove(id: string): Promise<Category> {
    return this.prisma.category.delete({
      where: { id },
    });
  }

  async getSubcategoryIds(parentId: string): Promise<string[]> {
    const categories = await this.prisma.category.findMany({
      where: { parentId },
      select: { id: true },
    });

    let ids = categories.map((c) => c.id);
    for (const id of ids) {
      const subIds = await this.getSubcategoryIds(id);
      ids = [...ids, ...subIds];
    }
    return ids;
  }
}
