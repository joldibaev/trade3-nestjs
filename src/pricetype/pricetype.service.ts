import { Injectable } from '@nestjs/common';
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

  findAll() {
    return this.prisma.priceType.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  findOne(id: string) {
    return this.prisma.priceType.findUniqueOrThrow({
      where: { id },
    });
  }

  update(id: string, updatePriceTypeDto: UpdatePriceTypeDto) {
    return this.prisma.priceType.update({
      where: { id },
      data: updatePriceTypeDto,
    });
  }

  remove(id: string) {
    return this.prisma.priceType.delete({
      where: { id },
    });
  }
}
