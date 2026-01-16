import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { ProductService } from './product.service';
import { CreateProductDto } from '../generated/dto/product/create-product.dto';
import { UpdateProductDto } from '../generated/dto/product/update-product.dto';
import { parseInclude } from '../common/utils/prisma-helpers';
import { ProductRelations } from '../generated/relations/product-relations.enum';
import { ApiIncludeQuery } from '../common/decorators/swagger-response.decorator';

@ApiTags('products')
@Controller('products')
export class ProductController {
  constructor(private readonly productsService: ProductService) {}

  @Post()
  create(@Body() createProductDto: CreateProductDto) {
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
  findAll(
    @Query('categoryId') categoryId?: string,
    @Query('query') query?: string,
    @Query('include') include?: string | string[],
  ) {
    return this.productsService.findAll(categoryId, query, parseInclude(include));
  }

  @Get(':id')
  @ApiIncludeQuery(ProductRelations)
  findOne(@Param('id') id: string, @Query('include') include?: string | string[]) {
    return this.productsService.findOne(id, parseInclude(include));
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateProductDto: UpdateProductDto) {
    return this.productsService.update(id, updateProductDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.productsService.remove(id);
  }
}
