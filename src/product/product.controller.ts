import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { ProductService } from './product.service';
import { CreateProductDto } from '../generated/dto/product/create-product.dto';
import { UpdateProductDto } from '../generated/dto/product/update-product.dto';
import { parseInclude } from '../common/utils/prisma-helpers';
import { ProductRelations } from '../generated/relations/product-relations.enum';
import {
  ApiStandardResponse,
  ApiStandardResponseArray,
  ApiIncludeQuery,
} from '../common/decorators/swagger-response.decorator';
import { Product } from '../generated/entities/product.entity';

@ApiTags('products')
@Controller('products')
export class ProductController {
  constructor(private readonly productsService: ProductService) {}

  @Post()
  @ApiStandardResponse(Product)
  create(@Body() createProductDto: CreateProductDto) {
    return this.productsService.create(createProductDto);
  }

  @Get()
  @ApiIncludeQuery(ProductRelations)
  @ApiStandardResponseArray(Product)
  @ApiQuery({ name: 'categoryId', required: false, type: String })
  findAll(@Query('categoryId') categoryId?: string, @Query('include') include?: string | string[]) {
    return this.productsService.findAll(categoryId, parseInclude(include));
  }

  @Get(':id')
  @ApiIncludeQuery(ProductRelations)
  @ApiStandardResponse(Product)
  findOne(@Param('id') id: string, @Query('include') include?: string | string[]) {
    return this.productsService.findOne(id, parseInclude(include));
  }

  @Patch(':id')
  @ApiStandardResponse(Product)
  update(@Param('id') id: string, @Body() updateProductDto: UpdateProductDto) {
    return this.productsService.update(id, updateProductDto);
  }

  @Delete(':id')
  @ApiStandardResponse(Product)
  remove(@Param('id') id: string) {
    return this.productsService.remove(id);
  }
}
