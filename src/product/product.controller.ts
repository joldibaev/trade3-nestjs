import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { ProductService } from './product.service';
import { CreateProductDto } from '../generated/types/backend/dto/product/create-product.dto';
import { UpdateProductDto } from '../generated/types/backend/dto/product/update-product.dto';
import { parseInclude } from '../common/utils/prisma-helpers';
import { ProductRelations } from '../generated/types/backend/relations/product-relations.enum';
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
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  findAll(
    @Query('categoryId') categoryId?: string,
    @Query('query') query?: string,
    @Query('isActive') isActive?: string,
    @Query('include') include?: string | string[],
  ) {
    const active = isActive === 'true' ? true : isActive === 'false' ? false : undefined;
    return this.productsService.findAll(categoryId, query, active, parseInclude(include));
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateProductDto: UpdateProductDto) {
    return this.productsService.update(id, updateProductDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.productsService.remove(id);
  }

  @Get(':id/last-purchase-price')
  getLastPurchasePrice(@Param('id') id: string) {
    return this.productsService.getLastPurchasePrice(id);
  }
}
