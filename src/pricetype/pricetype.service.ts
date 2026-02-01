import { Injectable } from '@nestjs/common';

import { PriceType } from '../generated/prisma/client';
import { CreatePriceTypeDto } from '../generated/types/backend/dto/price-type/create-price-type.dto';
import { UpdatePriceTypeDto } from '../generated/types/backend/dto/price-type/update-price-type.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PriceTypeService {
  constructor(private readonly prisma: PrismaService) {}

  create(createPriceTypeDto: CreatePriceTypeDto): Promise<PriceType> {
    return this.prisma.priceType.create({
      data: createPriceTypeDto,
    });
  }

  findAll(): Promise<PriceType[]> {
    return this.prisma.priceType.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  findOne(id: string): Promise<PriceType> {
    return this.prisma.priceType.findUniqueOrThrow({
      where: { id },
    });
  }

  update(id: string, updatePriceTypeDto: UpdatePriceTypeDto): Promise<PriceType> {
    return this.prisma.priceType.update({
      where: { id },
      data: updatePriceTypeDto,
    });
  }

  remove(id: string): Promise<PriceType> {
    return this.prisma.priceType.delete({
      where: { id },
    });
  }
}
