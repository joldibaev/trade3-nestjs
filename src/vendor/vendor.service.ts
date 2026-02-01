import { Injectable } from '@nestjs/common';

import { Vendor } from '../generated/prisma/client';
import { CreateVendorDto } from '../generated/types/backend/dto/vendor/create-vendor.dto';
import { UpdateVendorDto } from '../generated/types/backend/dto/vendor/update-vendor.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class VendorService {
  constructor(private readonly prisma: PrismaService) {}

  create(createVendorDto: CreateVendorDto): Promise<Vendor> {
    return this.prisma.vendor.create({
      data: createVendorDto,
    });
  }

  findAll(): Promise<Vendor[]> {
    return this.prisma.vendor.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  findOne(id: string): Promise<Vendor> {
    return this.prisma.vendor.findUniqueOrThrow({
      where: { id },
    });
  }

  async update(id: string, updateVendorDto: UpdateVendorDto): Promise<Vendor> {
    return this.prisma.vendor.update({
      where: { id },
      data: { ...updateVendorDto },
    });
  }

  remove(id: string): Promise<Vendor> {
    return this.prisma.vendor.delete({
      where: { id },
    });
  }
}
