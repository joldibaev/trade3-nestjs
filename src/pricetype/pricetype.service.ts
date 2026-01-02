import { Injectable } from '@nestjs/common';
import { CreatePriceTypeDto } from '../generated/dto/pricetype/create-pricetype.dto';
import { UpdatePriceTypeDto } from '../generated/dto/pricetype/update-pricetype.dto';
import { PrismaService } from '../core/prisma/prisma.service';

@Injectable()
export class PriceTypeService {
  constructor(private readonly prisma: PrismaService) {}

  create(createPriceTypeDto: CreatePriceTypeDto) {
    return this.prisma.priceType.create({
      data: createPriceTypeDto,
    });
  }

  findAll() {
    return this.prisma.priceType.findMany();
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
