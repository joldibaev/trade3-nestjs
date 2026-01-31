import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';

import { ApiIncludeQuery } from '../common/decorators/swagger-response.decorator';
import { parseInclude } from '../common/utils/prisma-helpers';
import { Product } from '../generated/prisma/client';
import { CreateProductDto } from '../generated/types/backend/dto/product/create-product.dto';
import { UpdateProductDto } from '../generated/types/backend/dto/product/update-product.dto';
import { ProductRelations } from '../generated/types/backend/relations';
import { ProductService } from './product.service';

@ApiTags('products')
@Controller('products')
export class ProductController {
  constructor(private readonly productsService: ProductService) {}

  @Post()
  create(@Body() createProductDto: CreateProductDto): Promise<Product> {
    return this.productsService.create(createProductDto);
  }

  @Get()
  @ApiIncludeQuery(ProductRelations)
  @ApiQuery({ name: 'categoryId', required: false, type: String })
  @ApiQuery({
    name: 'query',
    required: false,
    type: String,
    description: 'Search by name, article or barcode',
  })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  async findAll(
    @Query('categoryId') categoryId?: string,
    @Query('query') query?: string,
    @Query('isActive') isActive?: string,
    @Query('include') include?: string | string[],
  ): Promise<Product[]> {
    const active = isActive === 'true' ? true : isActive === 'false' ? false : undefined;
    return this.productsService.findAll(categoryId, query, active, parseInclude(include));
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<Product> {
    return this.productsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateProductDto: UpdateProductDto): Promise<Product> {
    return this.productsService.update(id, updateProductDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string): Promise<Product> {
    return this.productsService.remove(id);
  }

  @Get(':id/last-purchase-price')
  getLastPurchasePrice(@Param('id') id: string): Promise<number> {
    return this.productsService.getLastPurchasePrice(id);
  }
}
