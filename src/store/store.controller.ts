import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { StoreService } from './store.service';
import { CreateStoreDto } from '../generated/dto/store/create-store.dto';
import { UpdateStoreDto } from '../generated/dto/store/update-store.dto';
import { parseInclude } from '../common/utils/prisma-helpers';
import { StoreRelations } from '../generated/relations/store-relations.enum';
import { ApiIncludeQuery } from '../common/decorators/swagger-response.decorator';

@ApiTags('stores')
@Controller('stores')
export class StoreController {
  constructor(private readonly storesService: StoreService) {}

  @Post()
  create(@Body() createStoreDto: CreateStoreDto) {
    return this.storesService.create(createStoreDto);
  }

  @Get()
  @ApiIncludeQuery(StoreRelations)
  findAll(@Query('include') include?: string | string[]) {
    return this.storesService.findAll(parseInclude(include));
  }

  @Get(':id')
  @ApiIncludeQuery(StoreRelations)
  findOne(@Param('id') id: string, @Query('include') include?: string | string[]) {
    return this.storesService.findOne(id, parseInclude(include));
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateStoreDto: UpdateStoreDto) {
    return this.storesService.update(id, updateStoreDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.storesService.remove(id);
  }
}
