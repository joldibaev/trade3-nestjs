import { Injectable } from '@nestjs/common';
import { CreateVendorDto } from '../generated/dto/vendor/create-vendor.dto';
import { UpdateVendorDto } from '../generated/dto/vendor/update-vendor.dto';
import { PrismaService } from '../core/prisma/prisma.service';

@Injectable()
export class VendorService {
  constructor(private readonly prisma: PrismaService) {}

  create(createVendorDto: CreateVendorDto) {
    return this.prisma.vendor.create({
      data: createVendorDto,
    });
  }

  findAll() {
    return this.prisma.vendor.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  findOne(id: string) {
    return this.prisma.vendor.findUniqueOrThrow({
      where: { id },
    });
  }

  update(id: string, updateVendorDto: UpdateVendorDto) {
    return this.prisma.vendor.update({
      where: { id },
      data: updateVendorDto,
    });
  }

  remove(id: string) {
    return this.prisma.vendor.delete({
      where: { id },
    });
  }
}
