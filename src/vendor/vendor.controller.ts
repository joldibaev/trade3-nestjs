import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Vendor } from '../generated/prisma/client';
import { CreateVendorDto } from '../generated/types/backend/dto/vendor/create-vendor.dto';
import { UpdateVendorDto } from '../generated/types/backend/dto/vendor/update-vendor.dto';
import { VendorService } from './vendor.service';

@ApiTags('vendors')
@Controller('vendors')
export class VendorController {
  constructor(private readonly vendorsService: VendorService) {}

  @Post()
  create(@Body() createVendorDto: CreateVendorDto): Promise<Vendor> {
    return this.vendorsService.create(createVendorDto);
  }

  @Get()
  findAll(): Promise<Vendor[]> {
    return this.vendorsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<Vendor> {
    return this.vendorsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateVendorDto: UpdateVendorDto): Promise<Vendor> {
    return this.vendorsService.update(id, updateVendorDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string): Promise<Vendor> {
    return this.vendorsService.remove(id);
  }
}
