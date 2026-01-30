import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';

import { ApiIncludeQuery } from '../common/decorators/swagger-response.decorator';
import { parseInclude } from '../common/utils/prisma-helpers';
import { Store } from '../generated/prisma/client';
import { CreateStoreDto } from '../generated/types/backend/dto/store/create-store.dto';
import { UpdateStoreDto } from '../generated/types/backend/dto/store/update-store.dto';
import { StoreRelations } from '../generated/types/backend/relations';
import { StoreService } from './store.service';

@ApiTags('stores')
@Controller('stores')
export class StoreController {
  constructor(private readonly storesService: StoreService) {}

  @Post()
  create(@Body() createStoreDto: CreateStoreDto): Promise<Store> {
    return this.storesService.create(createStoreDto);
  }

  @Get()
  @ApiIncludeQuery(StoreRelations)
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  findAll(
    @Query('isActive') isActive?: string,
    @Query('include') include?: string | string[],
  ): Promise<Store[]> {
    const active = isActive === 'true' ? true : isActive === 'false' ? false : undefined;
    return this.storesService.findAll(active, parseInclude(include));
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<Store> {
    return this.storesService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateStoreDto: UpdateStoreDto): Promise<Store> {
    return this.storesService.update(id, updateStoreDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string): Promise<Store> {
    return this.storesService.remove(id);
  }
}
