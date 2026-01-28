import { Injectable } from '@nestjs/common';
import { CreatePriceDto } from '../generated/types/backend/dto/price/create-price.dto';
import { UpdatePriceDto } from '../generated/types/backend/dto/price/update-price.dto';
import { PrismaService } from '../core/prisma/prisma.service';

@Injectable()
export class PriceService {
  constructor(private readonly prisma: PrismaService) {}

  create(createPriceDto: CreatePriceDto) {
    // Upsert to handle unique constraint (update if exists)
    return this.prisma.price.upsert({
      where: {
        productId_priceTypeId: {
          productId: createPriceDto.productId,
          priceTypeId: createPriceDto.priceTypeId,
        },
      },
      create: createPriceDto,
      update: {
        value: createPriceDto.value,
      },
    });
  }

  findAll(include?: Record<string, boolean>) {
    return this.prisma.price.findMany({
      orderBy: { createdAt: 'desc' },
      include,
    });
  }

  findOne(id: string, include?: Record<string, boolean>) {
    return this.prisma.price.findUniqueOrThrow({
      where: { id },
      include,
    });
  }

  update(id: string, updatePriceDto: UpdatePriceDto) {
    return this.prisma.price.update({
      where: { id },
      data: updatePriceDto,
    });
  }

  remove(id: string) {
    return this.prisma.price.delete({
      where: { id },
    });
  }
}
