import { Injectable, NotFoundException } from '@nestjs/common';
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

  findAll(isActive?: boolean) {
    return this.prisma.vendor.findMany({
      where: {
        isActive,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const vendor = await this.prisma.vendor.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });
    if (!vendor) throw new NotFoundException('Поставщик не найден');
    return vendor;
  }

  update(id: string, updateVendorDto: UpdateVendorDto) {
    return this.prisma.vendor.update({
      where: { id },
      data: updateVendorDto,
    });
  }

  remove(id: string) {
    return this.prisma.vendor.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
