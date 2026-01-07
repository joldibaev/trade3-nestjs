import { Injectable } from '@nestjs/common';
import { CreateCategoryDto } from '../generated/dto/category/create-category.dto';
import { UpdateCategoryDto } from '../generated/dto/category/update-category.dto';
import { PrismaService } from '../core/prisma/prisma.service';

@Injectable()
export class CategoryService {
  constructor(private readonly prisma: PrismaService) {}

  create(createCategoryDto: CreateCategoryDto) {
    return this.prisma.category.create({
      data: createCategoryDto,
    });
  }

  findAll(include?: Record<string, boolean>) {
    return this.prisma.category.findMany({
      orderBy: { createdAt: 'desc' },
      include,
    });
  }

  findOne(id: string, include?: Record<string, boolean>) {
    return this.prisma.category.findUniqueOrThrow({
      where: { id },
      include,
    });
  }

  update(id: string, updateCategoryDto: UpdateCategoryDto) {
    return this.prisma.category.update({
      where: { id },
      data: updateCategoryDto,
    });
  }

  remove(id: string) {
    return this.prisma.category.delete({
      where: { id },
    });
  }
}
