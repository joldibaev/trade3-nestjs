import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { VendorService } from './vendor.service';
import { CreateVendorDto } from '../generated/dto/vendor/create-vendor.dto';
import { UpdateVendorDto } from '../generated/dto/vendor/update-vendor.dto';
import {
  ApiStandardResponse,
  ApiStandardResponseArray,
} from '../common/decorators/swagger-response.decorator';
import { Vendor } from '../generated/entities/vendor.entity';

@ApiTags('vendors')
@Controller('vendors')
export class VendorController {
  constructor(private readonly vendorsService: VendorService) {}

  @Post()
  @ApiStandardResponse(Vendor)
  create(@Body() createVendorDto: CreateVendorDto) {
    return this.vendorsService.create(createVendorDto);
  }

  @Get()
  @ApiStandardResponseArray(Vendor)
  findAll() {
    return this.vendorsService.findAll();
  }

  @Get(':id')
  @ApiStandardResponse(Vendor)
  findOne(@Param('id') id: string) {
    return this.vendorsService.findOne(id);
  }

  @Patch(':id')
  @ApiStandardResponse(Vendor)
  update(@Param('id') id: string, @Body() updateVendorDto: UpdateVendorDto) {
    return this.vendorsService.update(id, updateVendorDto);
  }

  @Delete(':id')
  @ApiStandardResponse(Vendor)
  remove(@Param('id') id: string) {
    return this.vendorsService.remove(id);
  }
}
