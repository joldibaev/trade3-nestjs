import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import { CreatePriceTypeDto } from '../generated/dto/price-type/create-price-type.dto';
import { UpdatePriceTypeDto } from '../generated/dto/price-type/update-price-type.dto';

@Injectable()
export class PriceTypeService {
  constructor(private readonly prisma: PrismaService) {}

  create(createPriceTypeDto: CreatePriceTypeDto) {
    return this.prisma.priceType.create({
      data: createPriceTypeDto,
    });
  }

  findAll(isActive?: boolean) {
    return this.prisma.priceType.findMany({
      where: {
        isActive,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const priceType = await this.prisma.priceType.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });
    if (!priceType) throw new NotFoundException('Тип цены не найден');
    return priceType;
  }

  update(id: string, updatePriceTypeDto: UpdatePriceTypeDto) {
    return this.prisma.priceType.update({
      where: { id },
      data: updatePriceTypeDto,
    });
  }

  remove(id: string) {
    return this.prisma.priceType.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
