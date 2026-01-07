import { Injectable } from '@nestjs/common';
import { CreatePriceDto } from '../generated/dto/price/create-price.dto';
import { UpdatePriceDto } from '../generated/dto/price/update-price.dto';
import { PrismaService } from '../core/prisma/prisma.service';

@Injectable()
export class PriceService {
  constructor(private readonly prisma: PrismaService) {}

  create(createPriceDto: CreatePriceDto) {
    return this.prisma.price.create({
      data: createPriceDto,
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
