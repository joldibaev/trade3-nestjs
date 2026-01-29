import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';

import { ApiIncludeQuery } from '../common/decorators/swagger-response.decorator';
import { parseInclude } from '../common/utils/prisma-helpers';
import { Prisma } from '../generated/prisma/client';
import { Category } from '../generated/prisma/client';
import { CreateCategoryDto } from '../generated/types/backend/dto/category/create-category.dto';
import { UpdateCategoryDto } from '../generated/types/backend/dto/category/update-category.dto';
import { CategoryRelations } from '../generated/types/backend/relations/category-relations.enum';
import { CategoryService } from './category.service';

@ApiTags('categories')
@Controller('categories')
export class CategoryController {
  constructor(private readonly categoriesService: CategoryService) {}

  @Post()
  create(@Body() createCategoryDto: CreateCategoryDto): Promise<Category> {
    return this.categoriesService.create(createCategoryDto);
  }

  @Get()
  @ApiIncludeQuery(CategoryRelations)
  @ApiQuery({ name: 'parentId', required: false, type: String })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  findAll(
    @Query('include') include?: string | string[],
    @Query('parentId') parentId?: string,
    @Query('isActive') isActive?: string,
  ): Promise<Category[]> {
    const where: Prisma.CategoryWhereInput = {};
    if (parentId) {
      where.parent = parentId === 'null' ? null : { id: parentId };
    }
    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }

    return this.categoriesService.findAll(where, parseInclude(include));
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<Category> {
    return this.categoriesService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateCategoryDto: UpdateCategoryDto): Promise<Category> {
    return this.categoriesService.update(id, updateCategoryDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string): Promise<Category> {
    return this.categoriesService.remove(id);
  }
}
