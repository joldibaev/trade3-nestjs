import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { CategoryService } from './category.service';
import { CreateCategoryDto } from '../generated/dto/category/create-category.dto';
import { UpdateCategoryDto } from '../generated/dto/category/update-category.dto';
import { parseInclude } from '../common/utils/prisma-helpers';
import { CategoryRelations } from '../generated/relations/category-relations.enum';
import { ApiIncludeQuery } from '../common/decorators/swagger-response.decorator';
import { Prisma } from '../generated/prisma/client';

@ApiTags('categories')
@Controller('categories')
export class CategoryController {
  constructor(private readonly categoriesService: CategoryService) {}

  @Post()
  create(@Body() createCategoryDto: CreateCategoryDto) {
    return this.categoriesService.create(createCategoryDto);
  }

  @Get()
  @ApiIncludeQuery(CategoryRelations)
  @ApiQuery({ name: 'parentId', required: false, type: String })
  findAll(@Query('include') include?: string | string[], @Query('parentId') parentId?: string) {
    const where: Prisma.CategoryWhereInput = {};
    if (parentId) {
      where.parent = parentId === 'null' ? null : { id: parentId };
    }

    return this.categoriesService.findAll(where, parseInclude(include));
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.categoriesService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateCategoryDto: UpdateCategoryDto) {
    return this.categoriesService.update(id, updateCategoryDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.categoriesService.remove(id);
  }
}
