import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { StoreService } from './store.service';
import { CreateStoreDto } from '../generated/dto/store/create-store.dto';
import { UpdateStoreDto } from '../generated/dto/store/update-store.dto';
import { parseInclude } from '../common/utils/prisma-helpers';
import { StoreRelations } from '../generated/relations/store-relations.enum';
import {
  ApiStandardResponse,
  ApiStandardResponseArray,
  ApiIncludeQuery,
} from '../common/decorators/swagger-response.decorator';
import { Store } from '../generated/entities/store.entity';

@ApiTags('stores')
@Controller('stores')
export class StoreController {
  constructor(private readonly storesService: StoreService) {}

  @Post()
  @ApiStandardResponse(Store)
  create(@Body() createStoreDto: CreateStoreDto) {
    return this.storesService.create(createStoreDto);
  }

  @Get()
  @ApiIncludeQuery(StoreRelations)
  @ApiStandardResponseArray(Store)
  findAll(@Query('include') include?: string | string[]) {
    return this.storesService.findAll(parseInclude(include));
  }

  @Get(':id')
  @ApiIncludeQuery(StoreRelations)
  @ApiStandardResponse(Store)
  findOne(@Param('id') id: string, @Query('include') include?: string | string[]) {
    return this.storesService.findOne(id, parseInclude(include));
  }

  @Patch(':id')
  @ApiStandardResponse(Store)
  update(@Param('id') id: string, @Body() updateStoreDto: UpdateStoreDto) {
    return this.storesService.update(id, updateStoreDto);
  }

  @Delete(':id')
  @ApiStandardResponse(Store)
  remove(@Param('id') id: string) {
    return this.storesService.remove(id);
  }
}
